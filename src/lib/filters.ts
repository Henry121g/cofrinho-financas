import { localDate } from "./format";

export interface Filters {
  from: string;
  to: string;
  account: string;
  category: string; // uuid, "sem" (sem categoria) ou ""
  q: string;
}

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

function firstOfMonthsAgo(today: string, months: number): string {
  const d = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

/** Lê filtros da URL com padrões seguros (últimos 3 meses), limitando o período a 5 anos. */
export function parseFilters(sp: Record<string, string | string[] | undefined>, timeZone: string, now = new Date()): Filters {
  const today = localDate(now, timeZone);
  let from = isDate(sp.de) ? sp.de : firstOfMonthsAgo(today, 2);
  let to = isDate(sp.ate) ? sp.ate : today;
  if (from > to) [from, to] = [to, from];
  const min = firstOfMonthsAgo(to, 60);
  if (from < min) from = min;
  const category = sp.categoria === "sem" ? "sem" : isUuid(sp.categoria) ? sp.categoria : "";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  return { from, to, account: isUuid(sp.conta) ? sp.conta : "", category, q };
}

export function filtersToQuery(f: Partial<Filters>): string {
  const map: Record<string, string | undefined> = { de: f.from, ate: f.to, conta: f.account, categoria: f.category, q: f.q };
  return new URLSearchParams(Object.entries(map).filter((e): e is [string, string] => Boolean(e[1]))).toString();
}
