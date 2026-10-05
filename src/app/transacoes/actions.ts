"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { friendlyDbError } from "@/lib/errors";
import { parseMoneyToCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export interface TxState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const schema = z.object({
  id: z.uuid().optional(),
  accountId: z.uuid("Escolha a conta."),
  categoryId: z.union([z.uuid(), z.literal("")]).transform((v) => v || null),
  occurredOn: z.iso.date("Informe uma data válida."),
  description: z.string().trim().min(1, "Informe a descrição.").max(200),
  kind: z.enum(["receita", "despesa"]),
  amount: z.string().transform((v, ctx) => {
    const c = parseMoneyToCents(v);
    if (c === null || c === 0) {
      ctx.addIssue({ code: "custom", message: "Valor inválido. Use o formato 123,45 (sem sinal)." });
      return z.NEVER;
    }
    return c;
  }),
  notes: z.string().trim().max(300).optional(),
});

export async function saveTransaction(_: TxState, formData: FormData): Promise<TxState> {
  const viewer = await requireViewer("/transacoes");
  const parsed = schema.safeParse({
    id: formData.get("id") || undefined,
    accountId: formData.get("accountId"),
    categoryId: formData.get("categoryId") ?? "",
    occurredOn: formData.get("occurredOn"),
    description: formData.get("description"),
    kind: formData.get("kind"),
    amount: formData.get("amount"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    return { fieldErrors };
  }
  const d = parsed.data;
  const row = {
    account_id: d.accountId,
    category_id: d.categoryId,
    occurred_on: d.occurredOn,
    description: d.description,
    amount_cents: d.kind === "despesa" ? -d.amount : d.amount,
    notes: d.notes ?? null,
  };
  const supabase = await createClient();
  const { error } = d.id
    ? await supabase.from("transactions").update(row).eq("id", d.id)
    : await supabase.from("transactions").insert({ ...row, user_id: viewer.id });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/transacoes");
  revalidatePath("/painel");
  redirect("/transacoes?salvo=1");
}

export async function deleteTransaction(formData: FormData) {
  await requireViewer("/transacoes");
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from("transactions").delete().eq("id", id.data);
  revalidatePath("/transacoes");
  revalidatePath("/painel");
  redirect("/transacoes?excluido=1");
}
