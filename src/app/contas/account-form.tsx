"use client";

import { useActionState } from "react";
import { Alert, Field, SubmitButton } from "@/components/ui";
import { saveAccount } from "./actions";

export function AccountForm(props: { id?: string; name?: string; type?: string; initial?: string; negative?: boolean }) {
  const [state, action] = useActionState(saveAccount, {});
  const key = props.id ?? "nova";
  const select = "min-h-11 rounded-lg border border-border bg-surface px-3 py-2 text-base";
  return (
    <form action={action} className="flex flex-col gap-3">
      {props.id && <input type="hidden" name="id" value={props.id} />}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Nome" name="name" id={`conta-nome-${key}`} defaultValue={props.name} required maxLength={60} />
        <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor={`conta-tipo-${key}`}>
          Tipo
          <select id={`conta-tipo-${key}`} name="type" defaultValue={props.type ?? "corrente"} className={select}>
            <option value="corrente">Conta corrente</option>
            <option value="poupanca">Poupança</option>
            <option value="cartao">Cartão de crédito</option>
            <option value="carteira">Carteira</option>
            <option value="investimento">Investimento</option>
          </select>
        </label>
        <Field label="Saldo inicial (R$)" name="initial" id={`conta-saldo-${key}`} inputMode="decimal" defaultValue={props.initial ?? "0,00"} />
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="negative" defaultChecked={props.negative} className="size-5" /> Saldo inicial negativo
        </label>
        <SubmitButton pendingLabel="Salvando…">{props.id ? "Salvar" : "Criar conta"}</SubmitButton>
      </div>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      {state.success && <Alert kind="success">{state.success}</Alert>}
    </form>
  );
}
