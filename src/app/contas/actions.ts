"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { friendlyDbError } from "@/lib/errors";
import { parseMoneyToCents } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

export interface AccountState {
  error?: string;
  success?: string;
}

export async function saveAccount(_: AccountState, formData: FormData): Promise<AccountState> {
  const viewer = await requireViewer("/contas");
  const parsed = z
    .object({
      id: z.uuid().optional(),
      name: z.string().trim().min(2, "Nome muito curto.").max(60),
      type: z.enum(["corrente", "poupanca", "cartao", "carteira", "investimento"]),
      initial: z.string().transform((v, ctx) => {
        const c = parseMoneyToCents(v || "0");
        if (c === null) {
          ctx.addIssue({ code: "custom", message: "Saldo inicial inválido. Use o formato 1.234,56." });
          return z.NEVER;
        }
        return c;
      }),
      negative: z.boolean(),
    })
    .safeParse({
      id: formData.get("id") || undefined,
      name: formData.get("name"),
      type: formData.get("type"),
      initial: formData.get("initial") ?? "0",
      negative: formData.get("negative") === "on",
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { id, name, type, initial, negative } = parsed.data;
  const row = { name, type, initial_balance_cents: negative ? -initial : initial };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("accounts").update(row).eq("id", id)
    : await supabase.from("accounts").insert({ ...row, user_id: viewer.id });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/contas");
  revalidatePath("/painel");
  return { success: id ? "Conta atualizada." : "Conta criada." };
}
