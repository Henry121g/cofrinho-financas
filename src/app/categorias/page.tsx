import type { Metadata } from "next";
import { EmptyState } from "@/components/empty-state";
import { buttonStyles } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteCategory, deleteRule } from "./actions";
import { ApplyRulesButton, CategoryForm, RuleForm } from "./forms";

export const metadata: Metadata = { title: "Categorias e regras" };

export default async function CategoriesPage() {
  await requireViewer("/categorias");
  const supabase = await createClient();
  const [{ data: categories }, { data: rules }] = await Promise.all([
    supabase.from("categories").select("id, name, kind, color").order("kind").order("name"),
    supabase.from("category_rules").select("id, pattern, match, category_id, priority").order("priority").order("created_at"),
  ]);
  const cats = categories ?? [];

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-2xl font-bold">Categorias e regras</h1>

      <section aria-labelledby="regras" className="flex flex-col gap-4">
        <h2 id="regras" className="text-lg font-semibold">Regras de categorização</h2>
        <p className="max-w-2xl text-sm text-muted">
          Aplicadas na prévia da importação e quando você clicar em “Aplicar regras”. Maiúsculas e acentos são
          ignorados. Se mais de uma regra combinar, vale a de <strong>menor número de prioridade</strong>; em caso de
          empate, a mais antiga.
        </p>
        <div className="rounded-xl border border-border bg-surface p-4">
          <RuleForm categories={cats} />
        </div>
        <ApplyRulesButton />
        {rules?.length ? (
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
            {rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-end justify-between gap-3 p-3">
                <RuleForm categories={cats} id={r.id} pattern={r.pattern} match={r.match} categoryId={r.category_id} priority={r.priority} />
                <form action={deleteRule}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className={buttonStyles.danger}>Excluir <span className="sr-only">regra {r.pattern}</span></button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Nenhuma regra ainda." />
        )}
      </section>

      <section aria-labelledby="categorias" className="flex flex-col gap-4">
        <h2 id="categorias" className="text-lg font-semibold">Categorias</h2>
        <div className="rounded-xl border border-border bg-surface p-4">
          <CategoryForm />
        </div>
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
          {cats.map((c) => (
            <li key={c.id} className="flex flex-wrap items-end justify-between gap-3 p-3">
              <CategoryForm id={c.id} name={c.name} kind={c.kind as "receita" | "despesa"} color={c.color} />
              <form action={deleteCategory}>
                <input type="hidden" name="id" value={c.id} />
                <button className={buttonStyles.danger}>Excluir <span className="sr-only">categoria {c.name}</span></button>
              </form>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">Excluir uma categoria deixa suas transações “sem categoria” e remove as regras ligadas a ela.</p>
      </section>
    </div>
  );
}
