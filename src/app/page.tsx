import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonStyles } from "@/components/button-styles";
import { getViewer } from "@/lib/auth";

export default async function HomePage() {
  if (await getViewer()) redirect("/painel");

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col items-start gap-4 py-6">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight">
          Todos os extratos no mesmo lugar, sem lançamento duplicado.
        </h1>
        <p className="max-w-xl text-lg text-muted">
          Importe o CSV do banco, confira a prévia, corrija o que for preciso e veja receitas, despesas e
          saldos por período, conta e categoria.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/cadastrar" className={buttonStyles.primary}>Criar conta de teste</Link>
          <Link href="/entrar" className={buttonStyles.secondary}>Entrar com conta demo</Link>
        </div>
        <p className="text-sm text-muted">
          Extratos fictícios para testar:{" "}
          <a href="/exemplos/extrato-banco-a.csv" className="underline" download>banco A</a>,{" "}
          <a href="/exemplos/extrato-banco-b.csv" className="underline" download>banco B</a> e{" "}
          <a href="/exemplos/extrato-com-erros.csv" className="underline" download>um com erros</a>.
        </p>
      </section>
      <section aria-labelledby="destaques" className="grid gap-4 sm:grid-cols-3">
        <h2 id="destaques" className="sr-only">Destaques</h2>
        {[
          ["Qualquer formato de CSV", "Ponto e vírgula ou vírgula, datas brasileiras ou ISO, 1.234,56 ou 1,234.56, crédito e débito separados."],
          ["Prévia antes de gravar", "Erros apontados por linha, duplicados identificados e categoria sugerida pelas suas regras."],
          ["Seus dados, só seus", "Cada usuário enxerga apenas as próprias contas e transações — garantido no banco."],
        ].map(([title, text]) => (
          <div key={title} className="rounded-xl border border-border bg-surface p-4">
            <h3 className="font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted">{text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
