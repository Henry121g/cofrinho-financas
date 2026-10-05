import { normalizeDescription } from "./statement/parse";

export interface Rule {
  id: string;
  pattern: string;
  match: "contem" | "comeca_com" | "igual";
  category_id: string;
  priority: number;
  created_at: string;
}

/** Mesma lógica de financas.match_category: menor prioridade vence; empate → regra mais antiga. */
export function matchCategory(rules: Rule[], description: string): string | null {
  const d = normalizeDescription(description);
  const sorted = [...rules].sort((a, b) => a.priority - b.priority || a.created_at.localeCompare(b.created_at));
  for (const r of sorted) {
    const p = normalizeDescription(r.pattern);
    const hit = r.match === "contem" ? d.includes(p) : r.match === "comeca_com" ? d.startsWith(p) : d === p;
    if (hit) return r.category_id;
  }
  return null;
}

export const MATCH_LABEL: Record<Rule["match"], string> = {
  contem: "contém",
  comeca_com: "começa com",
  igual: "é igual a",
};
