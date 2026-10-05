// Parser de extratos bancários em CSV. Funções puras (sem I/O): fáceis de testar e usadas no servidor.

export const MAX_FILE_BYTES = 1_000_000;
export const MAX_ROWS = 5000;

export type Delimiter = ";" | "," | "\t";

/** Divide o texto em linhas e células respeitando aspas ("a;b" e aspas duplicadas ""). */
export function splitCsv(text: string, delimiter: Delimiter): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Escolhe o separador mais frequente fora de aspas na primeira linha não vazia. */
export function detectDelimiter(text: string): Delimiter {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const outsideQuotes = firstLine.replace(/"[^"]*"/g, "");
  const counts = (["\t", ";", ","] as Delimiter[]).map((d) => [d, outsideQuotes.split(d).length - 1] as const);
  const best = counts.reduce((a, b) => (b[1] > a[1] ? b : a));
  return best[1] > 0 ? best[0] : ";";
}

const normalizeHeader = (h: string) =>
  h
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

export interface ColumnMap {
  date: number;
  description: number;
  amount?: number;
  credit?: number;
  debit?: number;
}

const HEADERS = {
  date: ["data", "date", "datalancamento", "datamovimento", "dtlancamento", "datatransacao"],
  description: ["descricao", "historico", "description", "lancamento", "memo", "detalhes", "estabelecimento"],
  amount: ["valor", "amount", "quantia", "valorrs", "montante"],
  credit: ["credito", "entrada", "credit", "creditos"],
  debit: ["debito", "saida", "debit", "debitos"],
};

/** Identifica colunas pelo cabeçalho. Retorna null com mensagem se faltar algo essencial. */
export function detectColumns(header: string[]): { map: ColumnMap } | { error: string } {
  const norm = header.map(normalizeHeader);
  // Nome exato primeiro; depois prefixo (ex.: "Valor (R$)" → "valorr" começa com "valor").
  const find = (names: string[]) => {
    const exact = norm.findIndex((h) => names.includes(h));
    return exact >= 0 ? exact : norm.findIndex((h) => names.some((n) => h.startsWith(n)));
  };
  const date = find(HEADERS.date);
  const description = find(HEADERS.description);
  const amount = find(HEADERS.amount);
  const credit = find(HEADERS.credit);
  const debit = find(HEADERS.debit);
  const missing: string[] = [];
  if (date < 0) missing.push("data");
  if (description < 0) missing.push("descrição/histórico");
  if (amount < 0 && (credit < 0 || debit < 0)) missing.push("valor (ou crédito e débito)");
  if (missing.length) {
    return {
      error: `Não encontramos a(s) coluna(s) ${missing.join(", ")} no cabeçalho. Colunas lidas: ${header
        .map((h) => `“${h.trim()}”`)
        .join(", ")}.`,
    };
  }
  return amount >= 0 ? { map: { date, description, amount } } : { map: { date, description, credit, debit } };
}

/** Converte data em AAAA-MM-DD. Aceita dd/mm/aaaa, dd/mm/aa, dd-mm-aaaa, dd.mm.aaaa, aaaa-mm-dd, aaaa/mm/dd. */
export function parseDate(raw: string): { value: string } | { error: string } {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let match = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T].*)?$/);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    match = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s.*)?$/);
    if (!match) return { error: `data “${s}” em formato desconhecido (use dd/mm/aaaa)` };
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    if (match[3].length === 2) y += y >= 70 ? 1900 : 2000;
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (m < 1 || m > 12 || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { error: `data “${s}” não existe` };
  }
  if (y < 1990 || y > 2100) return { error: `data “${s}” fora do intervalo aceito (1990–2100)` };
  return { value: `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}

/**
 * Converte valor em centavos sem ponto flutuante. Aceita "1.234,56", "1,234.56", "1234.56",
 * "R$ -1.234,56", "(123,45)", "123,45 D" / "C", "+10", "-0,5".
 */
export function parseAmount(raw: string): { value: number } | { error: string } {
  let s = raw.replace(/[\s ]/g, "").replace(/^R\$/i, "").replace(/R\$/i, "");
  if (s === "" || s === "-") return { error: "valor vazio" };
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  const suffix = s.match(/([DC])$/i);
  if (suffix) {
    negative = suffix[1].toUpperCase() === "D";
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negative = true; // sinal explícito sempre indica saída
    s = s.slice(1);
  } else if (s.startsWith("+")) s = s.slice(1);
  s = s.replace(/^R\$/i, "");
  if (!/^[\d.,]+$/.test(s)) return { error: `valor “${raw.trim()}” não é um número` };

  // O separador decimal é o último "." ou "," seguido de 1–2 dígitos no fim; os demais são milhares.
  const dec = s.match(/[.,](\d{1,2})$/);
  let intPart: string;
  let frac = "";
  if (dec) {
    intPart = s.slice(0, dec.index);
    frac = dec[1];
  } else intPart = s;
  const sepInt = intPart.match(/[.,]/g);
  if (sepInt) {
    // Separadores de milhar devem agrupar de 3 em 3 ("1.234.567").
    if (!/^\d{1,3}([.,]\d{3})+$/.test(intPart) || new Set(sepInt).size > 1) {
      return { error: `valor “${raw.trim()}” com separadores inconsistentes` };
    }
    intPart = intPart.replace(/[.,]/g, "");
  }
  if (intPart === "") intPart = "0";
  const cents = Number(intPart) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > 100_000_000_000) return { error: `valor “${raw.trim()}” grande demais` };
  return { value: negative ? -cents : cents };
}

export interface ParsedRow {
  line: number; // número da linha no arquivo (1 = cabeçalho)
  occurredOn: string;
  description: string;
  amountCents: number;
}

export interface RowError {
  line: number;
  message: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: RowError[];
  fatal?: string;
  delimiter?: Delimiter;
}

/** Lê o arquivo inteiro: cabeçalho, colunas e cada linha, acumulando erros por linha. */
export function parseStatement(text: string): ParseResult {
  if (text.length > MAX_FILE_BYTES) return { rows: [], errors: [], fatal: "Arquivo maior que 1 MB." };
  const clean = text.replace(/^﻿/, "");
  if (clean.includes("�")) {
    return { rows: [], errors: [], fatal: "O arquivo não está em UTF-8. Exporte o extrato em UTF-8 e tente de novo." };
  }
  const delimiter = detectDelimiter(clean);
  const table = splitCsv(clean, delimiter);
  if (table.length < 2) return { rows: [], errors: [], fatal: "O arquivo não tem linhas de dados.", delimiter };
  if (table.length - 1 > MAX_ROWS) {
    return { rows: [], errors: [], fatal: `O arquivo tem ${table.length - 1} linhas; o limite é ${MAX_ROWS}.`, delimiter };
  }
  const cols = detectColumns(table[0]);
  if ("error" in cols) return { rows: [], errors: [], fatal: cols.error, delimiter };
  const { map } = cols;

  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];
  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const problems: string[] = [];
    const date = parseDate(cells[map.date] ?? "");
    if ("error" in date) problems.push(date.error);
    const description = (cells[map.description] ?? "").trim().replace(/\s+/g, " ");
    if (!description) problems.push("descrição vazia");
    if (description.length > 200) problems.push("descrição com mais de 200 caracteres");

    let amount: number | null = null;
    if (map.amount !== undefined) {
      const a = parseAmount(cells[map.amount] ?? "");
      if ("error" in a) problems.push(a.error);
      else amount = a.value;
    } else {
      const c = (cells[map.credit!] ?? "").trim();
      const d = (cells[map.debit!] ?? "").trim();
      const credit = c ? parseAmount(c) : { value: 0 };
      const debit = d ? parseAmount(d) : { value: 0 };
      if ("error" in credit) problems.push(`crédito: ${credit.error}`);
      if ("error" in debit) problems.push(`débito: ${debit.error}`);
      if (!("error" in credit) && !("error" in debit)) amount = Math.abs(credit.value) - Math.abs(debit.value);
    }
    if (amount === 0) problems.push("valor igual a zero");

    if (problems.length || !("value" in date) || amount === null || amount === 0) {
      errors.push({ line, message: `Linha ${line}: ${problems.join("; ")}.` });
    } else {
      rows.push({ line, occurredOn: date.value, description, amountCents: amount });
    }
  });
  return { rows, errors, delimiter };
}

/** Descrição normalizada para a impressão digital (igual à função SQL financas.normalize). */
export function normalizeDescription(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
