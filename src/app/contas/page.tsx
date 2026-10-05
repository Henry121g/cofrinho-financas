import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { centsToInput } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";
import { AccountForm } from "./account-form";

export const metadata: Metadata = { title: "Contas" };

const TYPE_LABEL: Record<string, string> = {
  corrente: "Conta corrente",
  poupanca: "Poupança",
  cartao: "Cartão de crédito",
  carteira: "Carteira",
  investimento: "Investimento",
};

async function toggleArchive(formData: FormData) {
  "use server";
  await requireViewer("/contas");
  const parsed = z.object({ id: z.uuid(), archived: z.enum(["true", "false"]) }).safeParse({
    id: formData.get("id"),
    archived: formData.get("archived"),
  });
  if (!parsed.success) return;
  const supabase = await createClient();
  await supabase.from("accounts").update({ archived: parsed.data.archived === "true" }).eq("id", parsed.data.id);
  revalidatePath("/contas");
}

export default async function AccountsPage() {
  await requireViewer("/contas");
  const supabase = await createClient();
  const [{ data: accounts }, { data: balances }] = await Promise.all([
    supabase.from("accounts").select("id, name, type, initial_balance_cents, archived").order("archived").order("name"),
    supabase.rpc("account_balances"),
  ]);
  const balanceOf = new Map(((balances ?? []) as { account_id: string; balance_cents: number }[]).map((b) => [b.account_id, Number(b.balance_cents)]));

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">Contas</h1>
      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="mb-3 font-semibold">Nova conta</h2>
        <AccountForm />
      </section>
      <ul className="flex flex-col gap-3">
        {(accounts ?? []).map((a) => (
          <li key={a.id} className={`rounded-xl border border-border bg-surface p-4 ${a.archived ? "opacity-70" : ""}`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p>
                <span className="font-semibold">{a.name}</span>{" "}
                <span className="text-sm text-muted">· {TYPE_LABEL[a.type]}{a.archived && " · arquivada"}</span>
              </p>
              <p className="font-bold">Saldo: {formatMoney(balanceOf.get(a.id) ?? Number(a.initial_balance_cents))}</p>
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-brand">Editar <span className="sr-only">{a.name}</span></summary>
              <div className="mt-3 flex flex-col gap-3">
                <AccountForm id={a.id} name={a.name} type={a.type} initial={centsToInput(Math.abs(Number(a.initial_balance_cents)))} negative={Number(a.initial_balance_cents) < 0} />
                <form action={toggleArchive}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="archived" value={a.archived ? "false" : "true"} />
                  <button className="text-sm underline">{a.archived ? "Reativar conta" : "Arquivar conta (some da importação e de novos lançamentos)"}</button>
                </form>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
