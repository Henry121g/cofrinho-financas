import { createHash } from "node:crypto";
import { normalizeDescription, parseStatement, type ParsedRow, type RowError } from "./parse";

export type RowStatus = "nova" | "ja_importada";

export interface PreviewRow extends ParsedRow {
  fingerprint: string;
  status: RowStatus;
  /** Linha idêntica a outra anterior no mesmo arquivo: importada, mas sinalizada na prévia. */
  repeatedInFile: boolean;
}

export interface Preview {
  rows: PreviewRow[];
  errors: RowError[];
  fatal?: string;
  counts: { novas: number; duplicadas: number; invalidas: number };
}

/**
 * Impressão digital de uma linha: conta + data + valor + descrição normalizada + ordem da
 * ocorrência. A ordem permite duas compras idênticas no mesmo dia (legítimas) e ainda assim
 * reconhece a reimportação do mesmo arquivo (as mesmas ordens se repetem).
 */
export function fingerprint(accountId: string, row: Pick<ParsedRow, "occurredOn" | "amountCents" | "description">, ordinal: number) {
  return createHash("sha256")
    .update([accountId, row.occurredOn, row.amountCents, normalizeDescription(row.description), ordinal].join("|"))
    .digest("hex");
}

/** Monta a prévia: valida, calcula impressões digitais e marca o que já existe na conta. */
export function buildPreview(text: string, accountId: string, existing: Set<string>): Preview {
  const parsed = parseStatement(text);
  if (parsed.fatal) {
    return { rows: [], errors: [], fatal: parsed.fatal, counts: { novas: 0, duplicadas: 0, invalidas: 0 } };
  }
  const seen = new Map<string, number>();
  const rows: PreviewRow[] = parsed.rows.map((r) => {
    const key = [r.occurredOn, r.amountCents, normalizeDescription(r.description)].join("|");
    const ordinal = (seen.get(key) ?? 0) + 1;
    seen.set(key, ordinal);
    const fp = fingerprint(accountId, r, ordinal);
    return { ...r, fingerprint: fp, status: existing.has(fp) ? "ja_importada" : "nova", repeatedInFile: ordinal > 1 };
  });
  const novas = rows.filter((r) => r.status === "nova").length;
  return {
    rows,
    errors: parsed.errors,
    counts: { novas, duplicadas: rows.length - novas, invalidas: parsed.errors.length },
  };
}
