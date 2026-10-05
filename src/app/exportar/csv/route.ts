import { NextResponse, type NextRequest } from "next/server";
import { getViewer, TIME_ZONE } from "@/lib/auth";
import { centsToCsv, toCsv } from "@/lib/csv";
import { parseFilters } from "@/lib/filters";
import { createClient } from "@/lib/supabase/server";
import { transactionsQuery, type TransactionRow } from "@/lib/transactions-query";

const EXPORT_LIMIT = 20_000;

export async function GET(request: NextRequest) {
  if (!(await getViewer())) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  const f = parseFilters(sp, TIME_ZONE);
  const tipo = ["transacoes", "mensal", "categorias"].includes(sp.tipo) ? sp.tipo : "transacoes";
  const supabase = await createClient();
  const account = f.account || null;
  let csv: string;

  if (tipo === "transacoes") {
    const { data, error } = await transactionsQuery(supabase, f).limit(EXPORT_LIMIT);
    if (error) return NextResponse.json({ error: "falha ao exportar" }, { status: 500 });
    csv = toCsv(
      ["Data", "Descrição", "Categoria", "Conta", "Valor (R$)", "Observação"],
      ((data ?? []) as unknown as TransactionRow[]).map((r) => [
        r.occurred_on.split("-").reverse().join("/"),
        r.description,
        r.categories?.name ?? "Sem categoria",
        r.accounts.name,
        centsToCsv(Number(r.amount_cents)),
        r.notes ?? "",
      ]),
    );
  } else if (tipo === "mensal") {
    const category = f.category && f.category !== "sem" ? f.category : null;
    const { data, error } = await supabase.rpc("summary_monthly", { p_from: f.from, p_to: f.to, p_account: account, p_category: category });
    if (error) return NextResponse.json({ error: "falha ao exportar" }, { status: 500 });
    csv = toCsv(
      ["Mês", "Receitas (R$)", "Despesas (R$)", "Resultado (R$)"],
      ((data ?? []) as { month: string; income_cents: number; expense_cents: number }[]).map((m) => [
        String(m.month).slice(0, 7),
        centsToCsv(Number(m.income_cents)),
        centsToCsv(Number(m.expense_cents)),
        centsToCsv(Number(m.income_cents) - Number(m.expense_cents)),
      ]),
    );
  } else {
    const [exp, inc] = await Promise.all([
      supabase.rpc("summary_by_category", { p_from: f.from, p_to: f.to, p_sign: -1, p_account: account }),
      supabase.rpc("summary_by_category", { p_from: f.from, p_to: f.to, p_sign: 1, p_account: account }),
    ]);
    if (exp.error || inc.error) return NextResponse.json({ error: "falha ao exportar" }, { status: 500 });
    type Row = { name: string; total_cents: number; tx_count: number };
    csv = toCsv(
      ["Tipo", "Categoria", "Total (R$)", "Transações"],
      [
        ...((inc.data ?? []) as Row[]).map((r) => ["Receita", r.name, centsToCsv(Number(r.total_cents)), Number(r.tx_count)]),
        ...((exp.data ?? []) as Row[]).map((r) => ["Despesa", r.name, centsToCsv(Number(r.total_cents)), Number(r.tx_count)]),
      ],
    );
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cofrinho-${tipo}-${f.from}-a-${f.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
