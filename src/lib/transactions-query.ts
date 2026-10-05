import type { Filters } from "./filters";
import type { createClient } from "./supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

const SELECT = "id, occurred_on, description, amount_cents, notes, category_id, account_id, accounts(name), categories(name, color)";

/** Consulta de transações com os filtros da URL (RLS já restringe ao usuário). */
export function transactionsQuery(supabase: Client, f: Filters, opts: { count?: boolean } = {}) {
  let q = supabase
    .from("transactions")
    .select(SELECT, opts.count ? { count: "exact" } : undefined)
    .gte("occurred_on", f.from)
    .lte("occurred_on", f.to)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (f.account) q = q.eq("account_id", f.account);
  if (f.category === "sem") q = q.is("category_id", null);
  else if (f.category) q = q.eq("category_id", f.category);
  if (f.q) {
    const term = f.q.replace(/[%_\\,()*"]/g, " ").trim();
    if (term) q = q.ilike("description", `%${term}%`);
  }
  return q;
}

export interface TransactionRow {
  id: string;
  occurred_on: string;
  description: string;
  amount_cents: number;
  notes: string | null;
  category_id: string | null;
  account_id: string;
  accounts: { name: string };
  categories: { name: string; color: string } | null;
}
