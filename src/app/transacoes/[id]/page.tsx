import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buttonStyles } from "@/components/ui";
import { requireViewer, TIME_ZONE } from "@/lib/auth";
import { localDate } from "@/lib/format";
import { centsToInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { deleteTransaction } from "../actions";
import { TransactionForm } from "../transaction-form";

export const metadata: Metadata = { title: "Editar transação" };

export default async function EditTransactionPage({ params }: PageProps<"/transacoes/[id]">) {
  await requireViewer("/transacoes");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [{ data: tx }, { data: accounts }, { data: categories }] = await Promise.all([
    supabase.from("transactions").select("id, account_id, category_id, occurred_on, description, amount_cents, notes, import_id").eq("id", id).maybeSingle(),
    supabase.from("accounts").select("id, name").order("name"),
    supabase.from("categories").select("id, name, kind").order("name"),
  ]);
  if (!tx) notFound();
  const amount = Number(tx.amount_cents);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Editar transação</h1>
      {tx.import_id && (
        <p className="text-sm text-muted">Importada de extrato. Editar não afeta a detecção de duplicados em novas importações.</p>
      )}
      <TransactionForm
        accounts={accounts ?? []}
        categories={(categories ?? []) as never}
        today={localDate(new Date(), TIME_ZONE)}
        initial={{
          id: tx.id,
          account_id: tx.account_id,
          category_id: tx.category_id,
          occurred_on: tx.occurred_on,
          description: tx.description,
          kind: amount < 0 ? "despesa" : "receita",
          amount: centsToInput(Math.abs(amount)),
          notes: tx.notes,
        }}
      />
      <form action={deleteTransaction} className="border-t border-border pt-6">
        <input type="hidden" name="id" value={tx.id} />
        <button className={buttonStyles.danger}>Excluir transação</button>
      </form>
    </div>
  );
}
