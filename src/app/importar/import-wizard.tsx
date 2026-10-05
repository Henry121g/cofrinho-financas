"use client";

import { useActionState, useState } from "react";
import { Alert, SubmitButton } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { confirmImport, previewImport } from "./actions";

interface Option {
  id: string;
  name: string;
}

const MAX_BYTES = 1_000_000;

export function ImportWizard({ accounts, categories }: { accounts: Option[]; categories: (Option & { kind: string })[] }) {
  const [preview, previewAction] = useActionState(previewImport, {});
  const [result, confirmAction] = useActionState(confirmImport, {});
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const select = "min-h-11 rounded-lg border border-border bg-surface px-3 py-2 text-base";

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    const f = e.target.files?.[0];
    if (!f) return setFile(null);
    if (f.size > MAX_BYTES) {
      setFile(null);
      return setFileError("Arquivo maior que 1 MB. Divida o extrato em partes menores.");
    }
    setFile({ name: f.name, text: await f.text() });
  }

  const hidden = (
    <>
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="filename" value={file?.name ?? ""} />
      <input type="hidden" name="text" value={file?.text ?? ""} />
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <form action={previewAction} className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4">
        <h2 className="font-semibold">1. Escolha a conta e o arquivo</h2>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Conta de destino
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={select} required>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Extrato (CSV, até 1 MB)
            <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} className="text-sm file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-border file:bg-background file:px-3" />
          </label>
          {hidden}
          <SubmitButton pendingLabel="Analisando…" disabled={!file || !accountId}>Pré-visualizar</SubmitButton>
        </div>
        {fileError && <Alert kind="error">{fileError}</Alert>}
        {preview.error && <Alert kind="error">{preview.error}</Alert>}
        {preview.fatal && (
          <Alert kind="error">
            Não foi possível ler o arquivo: {preview.fatal}
          </Alert>
        )}
      </form>

      {preview.rows && preview.counts && (
        <form action={confirmAction} className="flex flex-col gap-4">
          {hidden}
          <h2 className="font-semibold">2. Confira a prévia</h2>
          <dl className="flex flex-wrap gap-3 text-sm" aria-live="polite">
            <div className="rounded-lg bg-success-bg px-3 py-2 text-success"><dt className="inline">Novas: </dt><dd className="inline font-bold">{preview.counts.novas}</dd></div>
            <div className="rounded-lg bg-surface px-3 py-2"><dt className="inline">Já importadas (ignoradas): </dt><dd className="inline font-bold">{preview.counts.duplicadas}</dd></div>
            <div className="rounded-lg bg-danger-bg px-3 py-2 text-danger"><dt className="inline">Com erro (ignoradas): </dt><dd className="inline font-bold">{preview.counts.invalidas}</dd></div>
          </dl>

          {preview.errors && preview.errors.length > 0 && (
            <section aria-labelledby="erros" className="rounded-xl border border-danger p-4">
              <h3 id="erros" className="mb-2 font-semibold text-danger">Linhas com erro</h3>
              <ul className="list-inside list-disc text-sm">
                {preview.errors.map((e) => <li key={e.line}>{e.message}</li>)}
              </ul>
              <p className="mt-2 text-xs text-muted">Corrija no arquivo e pré-visualize de novo, ou importe só as linhas válidas.</p>
            </section>
          )}

          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">Prévia das transações do arquivo</caption>
              <thead className="border-b border-border text-left text-muted">
                <tr>
                  <th scope="col" className="p-3">Linha</th>
                  <th scope="col" className="p-3">Data</th>
                  <th scope="col" className="p-3">Descrição</th>
                  <th scope="col" className="p-3 text-right">Valor</th>
                  <th scope="col" className="p-3">Categoria</th>
                  <th scope="col" className="p-3">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {preview.rows.map((r) => {
                  const kind = r.amountCents > 0 ? "receita" : "despesa";
                  return (
                    <tr key={r.line} className={r.status === "ja_importada" ? "text-muted" : ""}>
                      <td className="p-3">{r.line}</td>
                      <td className="p-3 whitespace-nowrap">{r.occurredOn.split("-").reverse().join("/")}</td>
                      <td className="p-3">{r.description}</td>
                      <td className={`p-3 text-right whitespace-nowrap ${r.amountCents < 0 ? "text-danger" : "text-success"}`}>{formatMoney(r.amountCents)}</td>
                      <td className="p-3">
                        {r.status === "nova" ? (
                          <>
                            <label htmlFor={`cat-${r.line}`} className="sr-only">Categoria da linha {r.line}</label>
                            <select id={`cat-${r.line}`} name={`cat-${r.line}`} defaultValue={r.suggestedCategory ?? ""} className="min-h-9 max-w-44 rounded-md border border-border bg-background px-2">
                              <option value="">Sem categoria</option>
                              {categories.filter((c) => c.kind === kind).map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </>
                        ) : "—"}
                      </td>
                      <td className="p-3">
                        {r.status === "ja_importada" ? "Já importada" : "Nova"}
                        {r.repeatedInFile && <span className="block text-xs text-muted">Repetida no arquivo (mantida)</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {result.error && <Alert kind="error">{result.error}</Alert>}
          <SubmitButton pendingLabel="Importando…" disabled={preview.counts.novas === 0} className="self-start">
            {preview.counts.novas === 0 ? "Nada novo para importar" : `Importar ${preview.counts.novas} transações`}
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
