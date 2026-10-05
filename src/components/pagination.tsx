import Link from "next/link";

/** Paginação por links (funciona sem JavaScript). `params` preserva os filtros atuais. */
export function Pagination({
  basePath,
  params,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const qs = new URLSearchParams(
      Object.entries({ ...params, pagina: String(p) }).filter((e): e is [string, string] => Boolean(e[1])),
    );
    return `${basePath}?${qs}`;
  };
  const link = "rounded-md border border-border bg-surface px-3 py-1.5 hover:border-brand";
  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-3 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} className={link}>
          ← Anterior
        </Link>
      ) : (
        <span />
      )}
      <span aria-current="page">
        Página {page} de {pages} · {total} {total === 1 ? "registro" : "registros"}
      </span>
      {page < pages ? (
        <Link href={href(page + 1)} className={link}>
          Próxima →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

export function parsePage(value: string | string[] | undefined): number {
  const n = Number(typeof value === "string" ? value : 1);
  return Number.isInteger(n) && n > 0 && n < 10_000 ? n : 1;
}
