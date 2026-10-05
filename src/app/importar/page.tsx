import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Importar extrato" };

export default async function ImportPage() {
  await requireViewer("/importar");
  const supabase = await createClient();
  const [{ data: accounts }, { data: categories }, { data: imports }] = await Promise.all([
    supabase.from("accounts").select("id, name").eq("archived", false).order("name"),
    supabase.from("categories").select("id, name, kind").order("name"),
    supabase.from("imports").select("id, filename, imported_rows, duplicate_rows, invalid_rows, created_at, accounts(name)").order("created_at", { ascending: false }).limit(5),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold">Importar extrato</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Aceita CSV com ponto e vírgula, vírgula ou tabulação; datas dd/mm/aaaa ou aaaa-mm-dd; valores como 1.234,56 ou
          1,234.56; e colunas de crédito e débito separadas. Nada é gravado antes da sua confirmação.
        </p>
        <p className="mt-2 text-sm">
          Sem extrato à mão? Use um fictício:{" "}
          <a href="/exemplos/extrato-banco-a.csv" download className="underline">banco A</a>,{" "}
          <a href="/exemplos/extrato-banco-b.csv" download className="underline">banco B</a>,{" "}
          <a href="/exemplos/extrato-com-erros.csv" download className="underline">com erros</a>.
        </p>
      </header>

      {accounts?.length ? (
        <ImportWizard accounts={accounts} categories={categories ?? []} />
      ) : (
        <EmptyState title="Você não tem contas ativas.">
          <Link href="/contas" className="underline">Cadastre uma conta</Link> para importar.
        </EmptyState>
      )}

      {imports && imports.length > 0 && (
        <section aria-labelledby="historico-importacoes">
          <h2 id="historico-importacoes" className="mb-3 text-lg font-semibold">Últimas importações</h2>
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface text-sm">
            {imports.map((i) => (
              <li key={i.id} className="flex flex-wrap justify-between gap-2 p-3">
                <span>
                  {i.filename} → {(i.accounts as unknown as { name: string }).name}
                </span>
                <span className="text-muted">
                  {i.imported_rows} importadas · {i.duplicate_rows} duplicadas · {i.invalid_rows} com erro
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
