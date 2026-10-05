"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { friendlyDbError } from "@/lib/errors";
import { matchCategory, type Rule } from "@/lib/rules";
import { MAX_FILE_BYTES } from "@/lib/statement/parse";
import { buildPreview } from "@/lib/statement/preview";
import { createClient } from "@/lib/supabase/server";

export interface PreviewRowView {
  line: number;
  occurredOn: string;
  description: string;
  amountCents: number;
  status: "nova" | "ja_importada";
  repeatedInFile: boolean;
  suggestedCategory: string | null;
}

export interface ImportState {
  error?: string;
  fatal?: string;
  rows?: PreviewRowView[];
  errors?: { line: number; message: string }[];
  counts?: { novas: number; duplicadas: number; invalidas: number };
}

const inputSchema = z.object({
  accountId: z.uuid("Escolha a conta de destino."),
  filename: z.string().trim().min(1).max(200),
  text: z.string().min(1, "Escolha um arquivo CSV.").max(MAX_FILE_BYTES, "Arquivo maior que 1 MB."),
});

async function load(formData: FormData) {
  const parsed = inputSchema.safeParse({
    accountId: formData.get("accountId"),
    filename: formData.get("filename"),
    text: formData.get("text"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." } as const;
  const supabase = await createClient();
  const { accountId, text, filename } = parsed.data;
  // Impressões digitais já existentes na conta (RLS: só as do próprio usuário).
  const { data: existing, error } = await supabase
    .from("transactions")
    .select("fingerprint")
    .eq("account_id", accountId)
    .not("fingerprint", "is", null);
  if (error) return { error: friendlyDbError(error) } as const;
  const preview = buildPreview(text, accountId, new Set((existing ?? []).map((r) => r.fingerprint as string)));
  return { supabase, accountId, filename, preview } as const;
}

export async function previewImport(_: ImportState, formData: FormData): Promise<ImportState> {
  await requireViewer("/importar");
  const loaded = await load(formData);
  if ("error" in loaded) return { error: loaded.error };
  const { preview, supabase } = loaded;
  if (preview.fatal) return { fatal: preview.fatal };
  const { data: rules } = await supabase.from("category_rules").select("id, pattern, match, category_id, priority, created_at");
  return {
    rows: preview.rows.map((r) => ({
      line: r.line,
      occurredOn: r.occurredOn,
      description: r.description,
      amountCents: r.amountCents,
      status: r.status,
      repeatedInFile: r.repeatedInFile,
      suggestedCategory: matchCategory((rules ?? []) as Rule[], r.description),
    })),
    errors: preview.errors,
    counts: preview.counts,
  };
}

export async function confirmImport(_: ImportState, formData: FormData): Promise<ImportState> {
  await requireViewer("/importar");
  const loaded = await load(formData);
  if ("error" in loaded) return { error: loaded.error };
  const { preview, supabase, accountId, filename } = loaded;
  if (preview.fatal) return { fatal: preview.fatal };

  // Categoria escolhida na prévia (campo cat-<linha>); vazio = regra do banco decide.
  const uuid = z.uuid();
  const rows = preview.rows
    .filter((r) => r.status === "nova")
    .map((r) => {
      const chosen = formData.get(`cat-${r.line}`);
      return {
        occurred_on: r.occurredOn,
        description: r.description,
        amount_cents: r.amountCents,
        fingerprint: r.fingerprint,
        category_id: uuid.safeParse(chosen).success ? (chosen as string) : null,
      };
    });
  if (rows.length === 0) return { error: "Nenhuma transação nova para importar: todas já existem nesta conta." };

  const { data, error } = await supabase.rpc("import_transactions", {
    p_account: accountId,
    p_filename: filename,
    p_rows: rows,
    p_invalid_rows: preview.counts.invalidas,
  });
  if (error) return { error: friendlyDbError(error) };
  const result = (data as { import_id: string; imported: number; duplicates: number }[])[0];

  revalidatePath("/painel");
  revalidatePath("/transacoes");
  redirect(`/transacoes?importacao=${result.import_id}&importadas=${result.imported}&duplicadas=${result.duplicates + preview.counts.duplicadas}&invalidas=${preview.counts.invalidas}`);
}
