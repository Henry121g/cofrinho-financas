import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildPreview } from "@/lib/statement/preview";
import { createTestDb, type TestDb } from "./harness";

let t: TestDb;
let ana: string, beto: string, outroApp: string;
let contaAna: string, contaBeto: string;

const exemplo = (nome: string) => readFileSync(join(__dirname, "..", "..", "public", "exemplos", nome), "utf8");

async function accountOf(uid: string) {
  const { rows } = await t.db.query<{ id: string }>(`select id from financas.accounts where user_id = $1 order by created_at limit 1`, [uid]);
  return rows[0].id;
}

async function existing(account: string) {
  const { rows } = await t.db.query<{ fingerprint: string }>(
    `select fingerprint from financas.transactions where account_id = $1 and fingerprint is not null`,
    [account],
  );
  return new Set(rows.map((r) => r.fingerprint));
}

/** Prévia + importação, como a Server Action faz. */
async function importFile(uid: string, account: string, file: string, overrides: Record<number, string> = {}) {
  const p = buildPreview(exemplo(file), account, await existing(account));
  const rows = p.rows.map((r) => ({
    occurred_on: r.occurredOn,
    description: r.description,
    amount_cents: r.amountCents,
    fingerprint: r.fingerprint,
    category_id: overrides[r.line] ?? null,
  }));
  return t.as(uid, async (tx) => {
    const { rows: out } = await tx.query<{ import_id: string; imported: number; duplicates: number }>(
      `select * from financas.import_transactions($1, $2, $3::jsonb, $4)`,
      [account, file, JSON.stringify(rows), p.counts.invalidas],
    );
    return out[0];
  });
}

async function categoryId(uid: string, name: string) {
  const { rows } = await t.db.query<{ id: string }>(`select id from financas.categories where user_id = $1 and name = $2`, [uid, name]);
  return rows[0].id;
}

beforeAll(async () => {
  t = await createTestDb();
  ana = await t.signUp("Ana");
  beto = await t.signUp("Beto");
  outroApp = await t.signUp("Usuário de outro app", "erp");
  contaAna = await accountOf(ana);
  contaBeto = await accountOf(beto);
});

describe("cadastro", () => {
  it("cria conta, 11 categorias e regras padrão só para usuários deste app", async () => {
    const { rows } = await t.db.query<{ cats: number; rules: number }>(
      `select (select count(*)::int from financas.categories where user_id = $1) cats,
              (select count(*)::int from financas.category_rules where user_id = $1) rules`,
      [ana],
    );
    expect(rows[0]).toEqual({ cats: 11, rules: 17 });
    const outro = await t.db.query(`select 1 from financas.profiles where id = $1`, [outroApp]);
    expect(outro.rows).toHaveLength(0);
  });
});

describe("importação", () => {
  it("importa o extrato e aplica as regras de categorização (sem acento, maiúsculas)", async () => {
    const r = await importFile(ana, contaAna, "extrato-banco-a.csv");
    expect(r).toMatchObject({ imported: 16, duplicates: 0 });
    const { rows } = await t.db.query<{ description: string; cat: string | null }>(
      `select t.description, c.name cat from financas.transactions t left join financas.categories c on c.id = t.category_id
       where t.import_id = $1 order by t.occurred_on, t.description`,
      [r.import_id],
    );
    const cat = (d: string) => rows.find((x) => x.description === d)?.cat;
    expect(cat("SUPERMERCADO BOM PRECO")).toBe("Mercado");
    expect(cat("FARMACIA SAUDE TOTAL")).toBe("Saúde");
    expect(cat("CONDOMINIO RESIDENCIAL")).toBe("Moradia");
    expect(cat("TRANSFERENCIA POUPANCA")).toBeNull(); // nenhuma regra
  });

  it("reimportar o mesmo arquivo não duplica nada e registra o lote", async () => {
    const r = await importFile(ana, contaAna, "extrato-banco-a.csv");
    expect(r).toMatchObject({ imported: 0, duplicates: 16 });
    const { rows } = await t.db.query<{ n: number }>(`select count(*)::int n from financas.transactions where account_id = $1`, [contaAna]);
    expect(rows[0].n).toBe(16);
    const lote = await t.db.query<{ imported_rows: number; duplicate_rows: number }>(
      `select imported_rows, duplicate_rows from financas.imports where id = $1`,
      [r.import_id],
    );
    expect(lote.rows[0]).toEqual({ imported_rows: 0, duplicate_rows: 16 });
  });

  it("categoria escolhida na prévia tem prioridade sobre a regra", async () => {
    const lazer = await categoryId(ana, "Lazer");
    const r = await importFile(ana, contaAna, "extrato-banco-b.csv", { 5: lazer }); // linha 5 = lanchonete
    expect(r.imported).toBe(8);
    const { rows } = await t.db.query<{ category_id: string }>(
      `select category_id from financas.transactions where import_id = $1 and description = 'Lanchonete esquina'`,
      [r.import_id],
    );
    expect(rows[0].category_id).toBe(lazer);
  });

  it("registra linhas inválidas no lote e importa só as válidas", async () => {
    const r = await importFile(ana, contaAna, "extrato-com-erros.csv");
    expect(r.imported).toBe(3);
    const { rows } = await t.db.query<{ invalid_rows: number; total_rows: number }>(
      `select invalid_rows, total_rows from financas.imports where id = $1`,
      [r.import_id],
    );
    expect(rows[0]).toEqual({ invalid_rows: 4, total_rows: 7 });
  });

  it("não importa na conta de outro usuário nem com categoria alheia", async () => {
    await expect(importFile(ana, contaBeto, "extrato-banco-a.csv")).rejects.toThrow(/CONTA_INVALIDA/);
    const catBeto = await categoryId(beto, "Mercado");
    const r = await t.as(ana, async (tx) => {
      const { rows } = await tx.query<{ import_id: string }>(
        `select * from financas.import_transactions($1, 'x.csv', $2::jsonb)`,
        [contaAna, JSON.stringify([{ occurred_on: "2026-10-20", description: "Teste mercado", amount_cents: -100, fingerprint: "a".repeat(64), category_id: catBeto }])],
      );
      return rows[0];
    });
    const { rows } = await t.db.query<{ cat_owner: string | null }>(
      `select c.user_id cat_owner from financas.transactions t left join financas.categories c on c.id = t.category_id where t.import_id = $1`,
      [r.import_id],
    );
    expect(rows[0].cat_owner).toBe(ana); // categoria alheia ignorada → regra "mercado" da própria Ana
  });

  it("importação é atômica: uma linha inválida no banco desfaz o lote inteiro", async () => {
    const antes = await t.db.query<{ n: number }>(`select count(*)::int n from financas.transactions where account_id = $1`, [contaAna]);
    await expect(
      t.as(ana, (tx) =>
        tx.query(`select * from financas.import_transactions($1, 'x.csv', $2::jsonb)`, [
          contaAna,
          JSON.stringify([
            { occurred_on: "2026-10-21", description: "Válida", amount_cents: -100, fingerprint: "b".repeat(64) },
            { occurred_on: "2026-10-21", description: "Valor zero", amount_cents: 0, fingerprint: "c".repeat(64) },
          ]),
        ]),
      ),
    ).rejects.toThrow(/check constraint/);
    const depois = await t.db.query<{ n: number }>(`select count(*)::int n from financas.transactions where account_id = $1`, [contaAna]);
    expect(depois.rows[0].n).toBe(antes.rows[0].n);
  });
});

describe("regras e resumos", () => {
  it("reaplicar regras categoriza transações pendentes", async () => {
    const poupanca = await t.as(ana, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `insert into financas.categories (user_id, name, kind) values ($1, 'Investimentos', 'despesa') returning id`,
        [ana],
      );
      await tx.query(
        `insert into financas.category_rules (user_id, pattern, match, category_id, priority) values ($1, 'transferencia poup', 'comeca_com', $2, 5)`,
        [ana, rows[0].id],
      );
      return rows[0].id;
    });
    const n = await t.as(ana, async (tx) => (await tx.query<{ n: number }>(`select financas.apply_rules() n`)).rows[0].n);
    expect(n).toBeGreaterThanOrEqual(1);
    const { rows } = await t.db.query<{ category_id: string }>(
      `select category_id from financas.transactions where description = 'TRANSFERENCIA POUPANCA'`,
    );
    expect(rows[0].category_id).toBe(poupanca);
  });

  it("resumo mensal bate com a soma das transações", async () => {
    const r = await t.as(ana, async (tx) =>
      (await tx.query<{ month: Date; income_cents: number; expense_cents: number }>(
        `select * from financas.summary_monthly('2026-09-01', '2026-09-30')`,
      )).rows,
    );
    expect(r).toHaveLength(1);
    expect(Number(r[0].income_cents)).toBe(520000 + 85000);
    expect(Number(r[0].expense_cents)).toBe(180000 + 38745 + 21000 + 2390 * 2 + 6432 + 48000 + 9250 + 3990 + 1875 + 15688 + 5600 + 9990 + 50000);
  });

  it("saldo da conta = saldo inicial + soma das transações", async () => {
    const { rows } = await t.db.query<{ s: number }>(`select sum(amount_cents)::bigint s from financas.transactions where account_id = $1`, [contaAna]);
    const bal = await t.as(ana, async (tx) =>
      (await tx.query<{ balance_cents: number }>(`select balance_cents from financas.account_balances() where account_id = $1`, [contaAna])).rows[0],
    );
    expect(Number(bal.balance_cents)).toBe(Number(rows[0].s));
  });

  it("resumo por categoria separa despesas e mostra 'Sem categoria'", async () => {
    const r = await t.as(ana, async (tx) =>
      (await tx.query<{ name: string; total_cents: number }>(`select * from financas.summary_by_category('2026-09-01', '2026-10-31', -1)`)).rows,
    );
    expect(r.find((x) => x.name === "Moradia")).toBeTruthy();
    expect(r.every((x) => Number(x.total_cents) > 0)).toBe(true);
  });
});

describe("isolamento entre usuários (RLS)", () => {
  it.each(["accounts", "categories", "transactions", "category_rules", "imports", "profiles"])(
    "Beto não lê %s da Ana",
    async (table) => {
      const col = table === "profiles" ? "id" : "user_id";
      const { rows } = await t.as(beto, (tx) => tx.query(`select 1 from financas.${table} where ${col} = $1`, [ana]));
      expect(rows).toHaveLength(0);
    },
  );

  it("resumos do Beto não incluem dados da Ana", async () => {
    const r = await t.as(beto, async (tx) => (await tx.query(`select * from financas.summary_monthly('2000-01-01', '2100-01-01')`)).rows);
    expect(r).toHaveLength(0);
  });

  it("Beto não altera nem apaga transações da Ana", async () => {
    const up = await t.as(beto, (tx) => tx.query(`update financas.transactions set amount_cents = 1 where user_id = $1 returning id`, [ana]));
    const del = await t.as(beto, (tx) => tx.query(`delete from financas.transactions where user_id = $1 returning id`, [ana]));
    expect(up.rows).toHaveLength(0);
    expect(del.rows).toHaveLength(0);
  });

  it("não lança transação na conta de outro usuário (RLS + FK composta)", async () => {
    await expect(
      t.as(beto, (tx) =>
        tx.query(
          `insert into financas.transactions (user_id, account_id, occurred_on, description, amount_cents) values ($1, $2, '2026-10-01', 'x', -1)`,
          [beto, contaAna],
        ),
      ),
    ).rejects.toThrow(/foreign key/);
    await expect(
      t.as(beto, (tx) =>
        tx.query(
          `insert into financas.transactions (user_id, account_id, occurred_on, description, amount_cents) values ($1, $2, '2026-10-01', 'x', -1)`,
          [ana, contaAna],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("usuário de outro app do portfólio não cria dados aqui", async () => {
    await expect(
      t.as(outroApp, (tx) =>
        tx.query(`insert into financas.categories (user_id, name, kind) values ($1, 'Invasão', 'despesa')`, [outroApp]),
      ),
    ).rejects.toThrow(/row-level security|foreign key/);
  });
});
