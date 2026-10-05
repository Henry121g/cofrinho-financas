import type { Filters } from "@/lib/filters";
import { buttonStyles } from "./ui";

interface Option {
  id: string;
  name: string;
}

/** Formulário GET de filtros (funciona sem JavaScript e mantém a URL compartilhável). */
export function FiltersForm({
  action,
  filters,
  accounts,
  categories,
  showSearch = false,
}: {
  action: string;
  filters: Filters;
  accounts: Option[];
  categories: Option[];
  showSearch?: boolean;
}) {
  const input = "min-h-11 rounded-lg border border-border bg-surface px-3 py-2";
  return (
    <form action={action} className="flex flex-wrap items-end gap-3" aria-label="Filtros">
      <label className="flex flex-col gap-1 text-sm font-medium">
        De
        <input type="date" name="de" defaultValue={filters.from} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Até
        <input type="date" name="ate" defaultValue={filters.to} className={input} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Conta
        <select name="conta" defaultValue={filters.account} className={input}>
          <option value="">Todas</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Categoria
        <select name="categoria" defaultValue={filters.category} className={input}>
          <option value="">Todas</option>
          <option value="sem">Sem categoria</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      {showSearch && (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Descrição contém
          <input type="search" name="q" defaultValue={filters.q} className={`${input} w-48`} />
        </label>
      )}
      <button type="submit" className={buttonStyles.secondary}>Aplicar</button>
    </form>
  );
}
