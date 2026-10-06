import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { FiltersForm } from "@/components/filters-form";
import { Pagination, parsePage } from "@/components/pagination";
import { Alert } from "@/components/ui";
import { buttonStyles } from "@/components/button-styles";
import { requireViewer, TIME_ZONE } from "@/lib/auth";
import { filtersToQuery, parseFilters } from "@/lib/filters";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { transactionsQuery, type TransactionRow } from "@/lib/transactions-query";

export const metadata: Metadata = { title: "Transações" };

const PAGE_SIZE = 30;

export default async function TransactionsPage({ searchParams }: PageProps<"/transacoes">) {
  await requireViewer("/transacoes");
  const sp = await searchParams;
  const f = parseFilters(sp, TIME_ZONE);
  const page = parsePage(sp.pagina);
  const supabase = await createClient();

  const [{ data: accounts }, { data: categories }, list] = await Promise.all([
    supabase.from("accounts").select("id, name").order("name"),
    supabase.from("categories").select("id, name").order("name"),
    transactionsQuery(supabase, f, { count: true }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
  ]);
  const rows = (list.data ?? []) as unknown as TransactionRow[];
  const qs = filtersToQuery(f);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Transações</h1>
        <div className="flex flex-wrap gap-2">
          <a href={`/exportar/csv?tipo=transacoes&${qs}`} className={buttonStyles.secondary} download>Exportar CSV</a>
          <Link href="/importar" className={buttonStyles.secondary}>Importar extrato</Link>
          <Link href="/transacoes/nova" className={buttonStyles.primary}>Nova transação</Link>
        </div>
      </header>

      {typeof sp.importadas === "string" && (
        <Alert kind="success">
          Importação concluída: {sp.importadas} transações importadas, {sp.duplicadas ?? 0} já existiam e{" "}
          {sp.invalidas ?? 0} linhas com erro foram ignoradas.
        </Alert>
      )}
      {sp.salvo && <Alert kind="success">Transação salva.</Alert>}
      {sp.excluido && <Alert kind="success">Transação excluída.</Alert>}

      <FiltersForm action="/transacoes" filters={f} accounts={accounts ?? []} categories={categories ?? []} showSearch />

      {list.error && <Alert kind="error">Não foi possível carregar as transações. Atualize a página.</Alert>}

      {rows.length ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Transações filtradas, mais recentes primeiro</caption>
            <thead className="border-b border-border text-left text-muted">
              <tr>
                <th scope="col" className="p-3">Data</th>
                <th scope="col" className="p-3">Descrição</th>
                <th scope="col" className="p-3">Categoria</th>
                <th scope="col" className="p-3">Conta</th>
                <th scope="col" className="p-3 text-right">Valor</th>
                <th scope="col" className="p-3"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="p-3 whitespace-nowrap">{r.occurred_on.split("-").reverse().join("/")}</td>
                  <td className="p-3">{r.description}</td>
                  <td className="p-3">
                    {r.categories ? (
                      <span className="inline-flex items-center gap-1.5">
                        <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: r.categories.color }} />
                        {r.categories.name}
                      </span>
                    ) : (
                      <span className="text-muted">Sem categoria</span>
                    )}
                  </td>
                  <td className="p-3">{r.accounts.name}</td>
                  <td className={`p-3 text-right whitespace-nowrap font-semibold ${Number(r.amount_cents) < 0 ? "text-danger" : "text-success"}`}>
                    {formatMoney(Number(r.amount_cents))}
                  </td>
                  <td className="p-3 text-right">
                    <Link href={`/transacoes/${r.id}`} className="font-semibold text-brand underline">
                      Editar <span className="sr-only">{r.description}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !list.error && (
          <EmptyState title="Nenhuma transação com esses filtros.">
            <Link href="/importar" className="underline">Importe um extrato</Link> ou ajuste o período.
          </EmptyState>
        )
      )}

      <Pagination
        basePath="/transacoes"
        params={{ de: f.from, ate: f.to, conta: f.account, categoria: f.category, q: f.q }}
        page={page}
        pageSize={PAGE_SIZE}
        total={list.count ?? 0}
      />
    </div>
  );
}
