import type { Metadata } from "next";
import Link from "next/link";
import { Inter, JetBrains_Mono } from "next/font/google";
import { getViewer } from "@/lib/auth";
import { signOut } from "@/app/(auth)/actions";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Cofrinho — finanças pessoais com importação de extratos", template: "%s · Cofrinho" },
  description: "Projeto de portfólio: gestão financeira com Next.js e Supabase. Dados fictícios.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const viewer = await getViewer();
  const navLink = "rounded-md px-2 py-1.5 hover:bg-surface";

  return (
    <html lang="pt-BR" className={`${inter.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2"
        >
          Pular para o conteúdo
        </a>
        <div role="note" className="bg-foreground px-4 py-1.5 text-center text-xs text-background">
          Projeto de portfólio com dados fictícios — nenhum valor ou banco é real.
        </div>
        <header className="border-b border-border">
          <nav
            aria-label="Principal"
            className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm"
          >
            <Link href={viewer ? "/painel" : "/"} className="mr-auto text-base font-bold text-brand">
              ◎ Cofrinho
            </Link>
            {viewer ? (
              <>
                <Link href="/painel" className={navLink}>Painel</Link>
                <Link href="/transacoes" className={navLink}>Transações</Link>
                <Link href="/importar" className={navLink}>Importar</Link>
                <Link href="/categorias" className={navLink}>Categorias e regras</Link>
                <Link href="/contas" className={navLink}>Contas</Link>
                <form action={signOut}>
                  <button type="submit" className={navLink}>
                    Sair <span className="sr-only">da conta de {viewer.fullName}</span>
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/entrar" className={navLink}>Entrar</Link>
                <Link href="/cadastrar" className={navLink}>Criar conta</Link>
              </>
            )}
          </nav>
        </header>
        <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-border px-4 py-6 text-center text-xs text-muted">
          Projeto de portfólio desenvolvido com assistência de IA (Claude Code).
        </footer>
      </body>
    </html>
  );
}
