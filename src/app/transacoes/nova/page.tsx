import type { Metadata } from "next";
import { requireViewer, TIME_ZONE } from "@/lib/auth";
import { localDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { TransactionForm } from "../transaction-form";

export const metadata: Metadata = { title: "Nova transação" };

export default async function NewTransactionPage() {
  await requireViewer("/transacoes/nova");
  const supabase = await createClient();
  const [{ data: accounts }, { data: categories }] = await Promise.all([
    supabase.from("accounts").select("id, name").eq("archived", false).order("name"),
    supabase.from("categories").select("id, name, kind").order("name"),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Nova transação</h1>
      <TransactionForm accounts={accounts ?? []} categories={(categories ?? []) as never} today={localDate(new Date(), TIME_ZONE)} />
    </div>
  );
}
