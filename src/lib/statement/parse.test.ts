import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectColumns, detectDelimiter, parseAmount, parseDate, parseStatement, splitCsv } from "./parse";
import { buildPreview } from "./preview";

const exemplo = (nome: string) => readFileSync(join(__dirname, "..", "..", "..", "public", "exemplos", nome), "utf8");
const ok = <T,>(r: { value: T } | { error: string }) => {
  if ("error" in r) throw new Error(r.error);
  return r.value;
};

describe("parseAmount", () => {
  it.each([
    ["1.234,56", 123456],
    ["-1.234,56", -123456],
    ["1,234.56", 123456],
    ["1234.56", 123456],
    ["1234,5", 123450],
    ["R$ -1.234,56", -123456],
    ["-R$ 10,00", -1000],
    ["(123,45)", -12345],
    ["123,45 D", -12345],
    ["123,45 C", 12345],
    ["+10", 1000],
    ["0,10", 10],
    ["19,99", 1999],
    ["1.000.000,00", 100000000],
    ["1.234", 123400], // sem casas decimais: ponto é milhar
    ["12 345,67", 1234567],
  ])("%s → %i centavos", (raw, cents) => {
    expect(ok(parseAmount(raw))).toBe(cents);
  });

  it.each(["", "-", "abc", "12,34,56", "1.23.4", "1,234.567,8", "R$"])("recusa “%s”", (raw) => {
    expect("error" in parseAmount(raw)).toBe(true);
  });
});

describe("parseDate", () => {
  it.each([
    ["05/09/2026", "2026-09-05"],
    ["5/9/2026", "2026-09-05"],
    ["05/09/26", "2026-09-05"],
    ["05-09-2026", "2026-09-05"],
    ["05.09.2026", "2026-09-05"],
    ["2026-09-05", "2026-09-05"],
    ["2026/09/05", "2026-09-05"],
    ["2026-09-05T10:00:00", "2026-09-05"],
    ["29/02/2028", "2028-02-29"],
  ])("%s → %s", (raw, iso) => {
    expect(ok(parseDate(raw))).toBe(iso);
  });

  it("explica datas impossíveis e formatos desconhecidos", () => {
    expect(parseDate("31/02/2026")).toEqual({ error: "data “31/02/2026” não existe" });
    expect(parseDate("29/02/2026")).toEqual({ error: "data “29/02/2026” não existe" });
    expect(parseDate("setembro 5")).toMatchObject({ error: expect.stringContaining("formato desconhecido") });
    expect(parseDate("01/01/1985")).toMatchObject({ error: expect.stringContaining("fora do intervalo") });
  });
});

describe("CSV", () => {
  it("detecta o separador ignorando o conteúdo entre aspas", () => {
    expect(detectDelimiter("Data;Histórico;Valor\n")).toBe(";");
    expect(detectDelimiter('date,"desc; com ponto e vírgula",amount\n')).toBe(",");
    expect(detectDelimiter("a\tb\tc\n")).toBe("\t");
  });

  it("respeita aspas, aspas duplicadas e quebras CRLF", () => {
    expect(splitCsv('a,"b, c","d ""e"""\r\n1,2,3\r\n', ",")).toEqual([
      ["a", "b, c", 'd "e"'],
      ["1", "2", "3"],
    ]);
  });

  it("identifica colunas por nomes comuns e explica quando falta alguma", () => {
    expect(detectColumns(["Data", "Histórico", "Valor (R$)"])).toEqual({ map: { date: 0, description: 1, amount: 2 } });
    expect(detectColumns(["date", "memo", "credit", "debit"])).toEqual({ map: { date: 0, description: 1, credit: 2, debit: 3 } });
    expect(detectColumns(["Data", "Valor"])).toMatchObject({ error: expect.stringContaining("descrição") });
  });
});

describe("arquivos de exemplo", () => {
  it("banco A: ponto e vírgula, dd/mm/aaaa, 1.234,56 e BOM", () => {
    const r = parseStatement(exemplo("extrato-banco-a.csv"));
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(16);
    expect(r.rows[0]).toMatchObject({ occurredOn: "2026-09-01", amountCents: 520000 });
    expect(r.rows[1].amountCents).toBe(-180000);
  });

  it("banco B: vírgula, datas ISO, colunas de crédito e débito e aspas", () => {
    const r = parseStatement(exemplo("extrato-banco-b.csv"));
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => x.amountCents)).toEqual([520000, -180000, -41210, -2750, 120000, -19540, -7490, -48000]);
    expect(r.rows[2].description).toBe('Supermercado "Bom Preço"');
  });

  it("arquivo com erros: aponta linha e motivo, e aproveita as linhas válidas", () => {
    const r = parseStatement(exemplo("extrato-com-erros.csv"));
    expect(r.rows.map((x) => x.line)).toEqual([2, 7, 8]);
    expect(r.errors.map((e) => e.message)).toEqual([
      "Linha 3: data “31/02/2026” não existe.",
      "Linha 4: descrição vazia.",
      "Linha 5: valor “-abc” não é um número.",
      "Linha 6: valor igual a zero.",
    ]);
  });

  it("erros fatais são compreensíveis", () => {
    expect(parseStatement("Data;Valor\n01/01/2026;10").fatal).toMatch(/descrição/);
    expect(parseStatement("Data;Histórico;Valor\n").fatal).toBe("O arquivo não tem linhas de dados.");
    expect(parseStatement("Data;Hist�rico;Valor\n01/01/2026;x;1").fatal).toMatch(/UTF-8/);
  });
});

describe("prévia e duplicados", () => {
  const conta = "11111111-1111-4111-8111-111111111111";

  it("compras idênticas no mesmo dia são importadas, mas sinalizadas", () => {
    const p = buildPreview(exemplo("extrato-banco-a.csv"), conta, new Set());
    const app = p.rows.filter((r) => r.description === "APP TRANSPORTE");
    expect(app).toHaveLength(2);
    expect(app[0].fingerprint).not.toBe(app[1].fingerprint);
    expect(app.map((r) => r.repeatedInFile)).toEqual([false, true]);
    expect(p.counts).toEqual({ novas: 16, duplicadas: 0, invalidas: 0 });
  });

  it("reimportar o mesmo arquivo marca tudo como já importado", () => {
    const primeira = buildPreview(exemplo("extrato-banco-a.csv"), conta, new Set());
    const segunda = buildPreview(exemplo("extrato-banco-a.csv"), conta, new Set(primeira.rows.map((r) => r.fingerprint)));
    expect(segunda.counts).toEqual({ novas: 0, duplicadas: 16, invalidas: 0 });
  });

  it("a mesma linha em outra conta não é duplicada; diferença só de maiúsculas/acentos é", () => {
    const a = buildPreview("Data;Descrição;Valor\n01/10/2026;Café;-5,00", conta, new Set());
    const outraConta = buildPreview("Data;Descrição;Valor\n01/10/2026;Café;-5,00", "22222222-2222-4222-8222-222222222222", new Set());
    const variacao = buildPreview("Data;Descrição;Valor\n01/10/2026;CAFE;-5,00", conta, new Set([a.rows[0].fingerprint]));
    expect(outraConta.rows[0].fingerprint).not.toBe(a.rows[0].fingerprint);
    expect(variacao.rows[0].status).toBe("ja_importada");
  });
});
