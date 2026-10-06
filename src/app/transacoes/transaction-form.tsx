"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui";
import { buttonStyles } from "@/components/button-styles";
import { saveTransaction } from "./actions";

interface Option {
  id: string;
  name: string;
}

export function TransactionForm(props: {
  accounts: Option[];
  categories: (Option & { kind: "receita" | "despesa" })[];
  today: string;
  initial?: {
    id: string;
    account_id: string;
    category_id: string | null;
    occurred_on: string;
    description: string;
    kind: "receita" | "despesa";
    amount: string;
    notes: string | null;
  };
}) {
  const [state, action] = useActionState(saveTransaction, {});
  const p = props.initial;
  const [kind, setKind] = useState<"receita" | "despesa">(p?.kind ?? "despesa");
  const fe = state.fieldErrors ?? {};
  const select = "min-h-11 rounded-lg border border-border bg-surface px-3 py-2 text-base";

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-4" noValidate>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {p && <input type="hidden" name="id" value={p.id} />}
      <fieldset className="flex gap-3">
        <legend className="mb-1 text-sm font-medium">Tipo</legend>
        {(["despesa", "receita"] as const).map((k) => (
          <label key={k} className="flex min-h-11 items-center gap-2 rounded-lg border border-border px-3">
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
            {k === "despesa" ? "Despesa" : "Receita"}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Data" name="occurredOn" type="date" defaultValue={p?.occurred_on ?? props.today} required error={fe.occurredOn} />
        <Field label="Valor (R$)" name="amount" inputMode="decimal" placeholder="123,45" defaultValue={p?.amount} required error={fe.amount} />
        <div className="sm:col-span-2">
          <Field label="Descrição" name="description" defaultValue={p?.description} required maxLength={200} error={fe.description} />
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Conta
          <select name="accountId" defaultValue={p?.account_id ?? props.accounts[0]?.id} className={select} required>
            {props.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {fe.accountId && <span className="text-danger">{fe.accountId}</span>}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Categoria
          <select key={kind} name="categoryId" defaultValue={p && p.kind === kind ? (p.category_id ?? "") : ""} className={select}>
            <option value="">Sem categoria</option>
            {props.categories.filter((c) => c.kind === kind).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="sm:col-span-2">
          <Field label="Observação (opcional)" name="notes" defaultValue={p?.notes ?? ""} maxLength={300} />
        </div>
      </div>
      <div className="flex gap-3">
        <SubmitButton pendingLabel="Salvando…">{p ? "Salvar alterações" : "Lançar transação"}</SubmitButton>
        <Link href="/transacoes" className={buttonStyles.secondary}>Cancelar</Link>
      </div>
    </form>
  );
}
