"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { friendlyDbError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

export interface CrudState {
  error?: string;
  success?: string;
}

export async function saveCategory(_: CrudState, formData: FormData): Promise<CrudState> {
  const viewer = await requireViewer("/categorias");
  const parsed = z
    .object({
      id: z.uuid().optional(),
      name: z.string().trim().min(2, "Nome muito curto.").max(40),
      kind: z.enum(["receita", "despesa"]),
      color: z.string().regex(/^#[0-9a-f]{6}$/i, "Cor inválida.").transform((c) => c.toLowerCase()),
    })
    .safeParse({ id: formData.get("id") || undefined, name: formData.get("name"), kind: formData.get("kind"), color: formData.get("color") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { id, ...row } = parsed.data;
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("categories").update(row).eq("id", id)
    : await supabase.from("categories").insert({ ...row, user_id: viewer.id });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/categorias");
  return { success: id ? "Categoria atualizada." : "Categoria criada." };
}

export async function deleteCategory(formData: FormData) {
  await requireViewer("/categorias");
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  // Transações ficam "sem categoria"; regras da categoria são removidas (FK).
  await supabase.from("categories").delete().eq("id", id.data);
  revalidatePath("/categorias");
}

export async function saveRule(_: CrudState, formData: FormData): Promise<CrudState> {
  const viewer = await requireViewer("/categorias");
  const parsed = z
    .object({
      id: z.uuid().optional(),
      pattern: z.string().trim().min(2, "O texto da regra precisa de ao menos 2 caracteres.").max(100),
      match: z.enum(["contem", "comeca_com", "igual"]),
      categoryId: z.uuid("Escolha a categoria."),
      priority: z.coerce.number().int().min(1, "Prioridade entre 1 e 1000.").max(1000, "Prioridade entre 1 e 1000."),
    })
    .safeParse({
      id: formData.get("id") || undefined,
      pattern: formData.get("pattern"),
      match: formData.get("match"),
      categoryId: formData.get("categoryId"),
      priority: formData.get("priority"),
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { id, categoryId, ...rest } = parsed.data;
  const row = { ...rest, category_id: categoryId };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("category_rules").update(row).eq("id", id)
    : await supabase.from("category_rules").insert({ ...row, user_id: viewer.id });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/categorias");
  return { success: id ? "Regra atualizada." : "Regra criada." };
}

export async function deleteRule(formData: FormData) {
  await requireViewer("/categorias");
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  await supabase.from("category_rules").delete().eq("id", id.data);
  revalidatePath("/categorias");
}

export async function applyRules(): Promise<CrudState> {
  await requireViewer("/categorias");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_rules");
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/transacoes");
  revalidatePath("/painel");
  const n = Number(data);
  return { success: n === 0 ? "Nenhuma transação sem categoria corresponde às regras." : `${n} transações categorizadas.` };
}
