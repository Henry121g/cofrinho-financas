"use client";

import { useActionState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui";
import { applyRules, saveCategory, saveRule, type CrudState } from "./actions";

function Feedback({ state }: { state: CrudState }) {
  if (state.error) return <Alert kind="error">{state.error}</Alert>;
  if (state.success) return <Alert kind="success">{state.success}</Alert>;
  return null;
}

const select = "min-h-11 rounded-lg border border-border bg-surface px-3 py-2 text-base";

export function CategoryForm(props: { id?: string; name?: string; kind?: "receita" | "despesa"; color?: string }) {
  const [state, action] = useActionState(saveCategory, {});
  const key = props.id ?? "nova";
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        {props.id && <input type="hidden" name="id" value={props.id} />}
        <Field label="Nome" name="name" id={`cat-nome-${key}`} defaultValue={props.name} required maxLength={40} />
        <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor={`cat-tipo-${key}`}>
          Tipo
          <select id={`cat-tipo-${key}`} name="kind" defaultValue={props.kind ?? "despesa"} className={select}>
            <option value="despesa">Despesa</option>
            <option value="receita">Receita</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor={`cat-cor-${key}`}>
          Cor
          <input id={`cat-cor-${key}`} type="color" name="color" defaultValue={props.color ?? "#64748b"} className="h-11 w-14 rounded-lg border border-border bg-surface" />
        </label>
        <SubmitButton variant={props.id ? "secondary" : "primary"} pendingLabel="Salvando…">
          {props.id ? "Salvar" : "Criar categoria"} <span className="sr-only">{props.name}</span>
        </SubmitButton>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function RuleForm(props: {
  categories: { id: string; name: string; kind: string }[];
  id?: string;
  pattern?: string;
  match?: string;
  categoryId?: string;
  priority?: number;
}) {
  const [state, action] = useActionState(saveRule, {});
  const key = props.id ?? "nova";
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        {props.id && <input type="hidden" name="id" value={props.id} />}
        <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor={`regra-tipo-${key}`}>
          Se a descrição
          <select id={`regra-tipo-${key}`} name="match" defaultValue={props.match ?? "contem"} className={select}>
            <option value="contem">contém</option>
            <option value="comeca_com">começa com</option>
            <option value="igual">é igual a</option>
          </select>
        </label>
        <Field label="Texto" name="pattern" id={`regra-texto-${key}`} defaultValue={props.pattern} required maxLength={100} />
        <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor={`regra-cat-${key}`}>
          Categoria
          <select id={`regra-cat-${key}`} name="categoryId" defaultValue={props.categoryId ?? ""} className={select} required>
            <option value="" disabled>Escolha…</option>
            {props.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name} ({c.kind})</option>
            ))}
          </select>
        </label>
        <Field label="Prioridade" name="priority" id={`regra-prio-${key}`} type="number" min={1} max={1000} defaultValue={props.priority ?? 100} className="w-24 min-h-11 rounded-lg border border-border bg-surface px-3 py-2 text-base" />
        <SubmitButton variant={props.id ? "secondary" : "primary"} pendingLabel="Salvando…">
          {props.id ? "Salvar" : "Criar regra"}
        </SubmitButton>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function ApplyRulesButton() {
  const [state, action] = useActionState(applyRules, {});
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <SubmitButton variant="secondary" pendingLabel="Aplicando…">Aplicar regras às transações sem categoria</SubmitButton>
      <Feedback state={state} />
    </form>
  );
}
