import type { Metadata } from "next";
import Link from "next/link";
import { CategoryBars, MonthlyChart, type CategoryPoint, type MonthPoint } from "@/components/charts";
import { EmptyState } from "@/components/empty-state";
import { FiltersForm } from "@/components/filters-form";
import { Alert, buttonStyles } from "@/components/ui";
import { requireViewer, TIME_ZONE } from "@/lib/auth";
import { filtersToQuery, parseFilters } from "@/lib/filters";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Painel" };

export default async function DashboardPage({ searchParams }: PageProps<"/painel">) {
  const viewer = await requireViewer("/painel");
  const f = parseFilters(await searchParams, TIME_ZONE);
  const supabase = await createClient();
  const account = f.account || null;
  const category = f.category && f.category !== "sem" ? f.category : null;

  const [accounts, categories, monthly, expenses, incomes, balances] = await Promise.all([
    supabase.from("accounts").select("id, name").order("name"),
    supabase.from("categories").select("id, name").order("name"),
    supabase.rpc("summary_monthly", { p_from: f.from, p_to: f.to, p_account: account, p_category: category }),
    supabase.rpc("summary_by_category", { p_from: f.from, p_to: f.to, p_sign: -1, p_account: account }),
    supabase.rpc("summary_by_category", { p_from: f.from, p_to: f.to, p_sign: 1, p_account: account }),
    supabase.rpc("account_balances"),
  ]);

  const months: MonthPoint[] = ((monthly.data ?? []) as { month: string; income_cents: number; expense_cents: number }[]).map((m) => ({
    month: String(m.month).slice(0, 10),
    income: Number(m.income_cents),
    expense: Number(m.expense_cents),
  }));
  const toPoints = (rows: unknown): CategoryPoint[] =>
    ((rows ?? []) as { category_id: string | null; name: string; total_cents: number; tx_count: number }[]).map((r) => ({
      id: r.category_id,
      name: r.name,
      total: Number(r.total_cents),
      count: Number(r.tx_count),
    }));
  const income = months.reduce((a, m) => a + m.income, 0);
  const expense = months.reduce((a, m) => a + m.expense, 0);
  const anyError = [monthly, expenses, incomes, balances].some((r) => r.error);
  const qs = filtersToQuery({ ...f, q: "" });
  const bal = (balances.data ?? []) as { account_id: string; name: string; archived: boolean; balance_cents: number }[];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Painel</h1>
          <p className="text-sm text-muted">Olá, {viewer.fullName}. Valores calculados a partir das transações gravadas.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/exportar/csv?tipo=mensal&${qs}`} className={buttonStyles.secondary} download>Exportar resumo mensal</a>
          <a href={`/exportar/csv?tipo=categorias&${qs}`} className={buttonStyles.secondary} download>Exportar por categoria</a>
        </div>
      </header>

      <FiltersForm action="/painel" filters={f} accounts={accounts.data ?? []} categories={categories.data ?? []} />
      {f.category === "sem" && <p className="text-sm text-muted">O filtro “Sem categoria” vale para a lista de transações; o painel mostra todas as categorias.</p>}
      {anyError && <Alert kind="error">Parte dos indicadores não pôde ser carregada. Atualize a página.</Alert>}

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ["Receitas no período", formatMoney(income)],
          ["Despesas no período", formatMoney(expense)],
          ["Resultado do período", formatMoney(income - expense)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-surface p-4">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="mt-1 text-2xl font-bold">{value}</dd>
          </div>
        ))}
      </dl>

      {months.length === 0 ? (
        <EmptyState title="Nenhuma transação no período.">
          <Link href="/importar" className="underline">Importe um extrato de exemplo</Link> para ver os gráficos.
        </EmptyState>
      ) : (
        <>
          <section className="rounded-xl border border-border bg-surface p-4">
            <MonthlyChart data={months} />
          </section>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-surface p-4">
              <CategoryBars data={toPoints(expenses.data)} title="Despesas por categoria" />
            </section>
            <section className="rounded-xl border border-border bg-surface p-4">
              <h2 className="mb-3 font-semibold">Receitas por categoria</h2>
              <ul className="flex flex-col divide-y divide-border text-sm">
                {toPoints(incomes.data).map((r) => (
                  <li key={r.id ?? "sem"} className="flex justify-between py-2">
                    <span>{r.name}</span>
                    <span>{formatMoney(r.total)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}

      <section aria-labelledby="saldos">
        <h2 id="saldos" className="mb-3 text-lg font-semibold">Saldo atual por conta</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bal.map((b) => (
            <li key={b.account_id} className="rounded-xl border border-border bg-surface p-4">
              <p className="text-sm text-muted">{b.name}{b.archived && " (arquivada)"}</p>
              <p className={`mt-1 text-xl font-bold ${Number(b.balance_cents) < 0 ? "text-danger" : ""}`}>{formatMoney(Number(b.balance_cents))}</p>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Saldo = saldo inicial da conta + todas as transações (independente do filtro de período).</p>
      </section>
    </div>
  );
}
