# Cofrinho — gestão financeira com importação de extratos

> Projeto de portfólio com **dados fictícios**, desenvolvido com assistência de IA (Claude Code).
> Nenhum valor, banco ou pessoa é real.

**Demonstração:** _pendente de deploy_ · **CI:** ver aba Actions

<!-- Screenshots reais serão adicionadas após o deploy (docs/screenshots/). -->

## O problema

Quem controla as próprias finanças junta extratos de bancos diferentes, cada um com um CSV
diferente. Importar à mão gera duplicados, categorizar é repetitivo e os apps prontos não mostram
os recortes que a pessoa quer.

**Público:** pessoas que organizam as finanças a partir de extratos exportados do banco.

## Funcionalidades

- **Importação de CSV** com **prévia**: status de cada linha, erros por linha e categoria sugerida
  (editável) antes de gravar.
- **Formatos variados** detectados automaticamente (veja abaixo).
- **Duplicados** identificados: reimportar o mesmo extrato não duplica nada; compras idênticas
  legítimas no mesmo dia são preservadas e sinalizadas.
- **Regras de categorização** editáveis (contém / começa com / igual, com prioridade), aplicadas na
  importação e sob demanda.
- **Contas** com saldo inicial, **categorias** de receita e despesa, lançamentos manuais.
- **Painel** com filtros (período, conta, categoria): receitas, despesas, resultado, gráfico mensal,
  despesas por categoria e saldo por conta — tudo calculado no banco a partir dos dados gravados.
- **Exportação CSV** das transações filtradas, do resumo mensal e do resumo por categoria.

### Formatos de extrato aceitos

| Aspecto | Variações |
|---|---|
| Separador | `;` `,` tabulação — detecção automática, respeitando aspas |
| Data | `dd/mm/aaaa`, `dd/mm/aa`, `dd-mm-aaaa`, `dd.mm.aaaa`, `aaaa-mm-dd`, `aaaa/mm/dd` |
| Valor | `1.234,56` · `1,234.56` · `R$ -1.234,56` · `(123,45)` · `123,45 D`/`C` · colunas de crédito e débito |
| Cabeçalho | data, descrição/histórico/memo, valor/quantia, crédito/débito (com ou sem acentos) |

Arquivos fictícios para testar em [`public/exemplos/`](public/exemplos/): banco A, banco B e um
com erros propositais.

### Como experimentar

- **Conta demo:** `demo@financas.demo.test` / `demo12345` (dados fictícios, redefinidos diariamente).
- **Conta própria:** cadastre-se, baixe um extrato de exemplo e importe.

## Decisões técnicas

### 1. Parser puro, testado à exaustão
`src/lib/statement/parse.ts` não faz I/O: recebe texto e devolve linhas válidas e erros. Isso permite
43 testes rápidos cobrindo cada formato, datas impossíveis (31/02), separadores inconsistentes e
mensagens ao usuário (“Linha 3: data “31/02/2026” não existe.”).

**Valores sem ponto flutuante:** o separador decimal é o último `.` ou `,` seguido de 1–2 dígitos;
os demais precisam agrupar de 3 em 3 (senão é erro). Centavos são calculados com aritmética de
inteiros.

### 2. Duplicados por impressão digital
Cada linha gera um SHA-256 de **conta + data + valor + descrição normalizada + ordem da ocorrência**.
Um índice único `(account_id, fingerprint)` com `ON CONFLICT DO NOTHING` torna a reimportação
idempotente. A **ordem da ocorrência** resolve o caso de duas compras idênticas no mesmo dia: são
legítimas, recebem impressões diferentes (1ª e 2ª) e reaparecem iguais se o arquivo for reimportado.

### 3. Prévia sem confiar no navegador
O navegador lê o arquivo e envia o texto; o servidor **re-processa** o CSV tanto na prévia quanto na
confirmação. Só a escolha de categoria vem da tela — e o banco ignora categorias que não sejam do
usuário. A importação é **atômica** (função PL/pgSQL): grava tudo ou nada e registra o lote.

### 4. Regras na mesma lógica, em dois lugares
A sugestão na prévia roda em TypeScript (sem uma consulta por linha); a aplicação definitiva roda
em SQL (`financas.match_category`). Ambas normalizam acentos e maiúsculas e usam o mesmo critério
de desempate (prioridade, depois a regra mais antiga), com testes nas duas pontas.

### 5. Isolamento por usuário
RLS `user_id = auth.uid()` em todas as tabelas + **FKs compostas** `(user_id, id)`: não é possível
lançar em conta ou categoria de outra pessoa nem por acidente na aplicação. Funções de resumo são
`security invoker` (respeitam a RLS). Testes cobrem leitura, escrita, resumos e importação cruzada.

### 6. Gráficos acessíveis
Barras em SVG próprio (sem biblioteca), paleta validada para daltonismo e contraste nos modos claro
e escuro, um único eixo, tooltip por barra também acessível por teclado e **tabela equivalente**.

### 7. Infraestrutura compartilhada
Schema `financas` no mesmo projeto Supabase das outras demos do portfólio (plano gratuito: 2
projetos). Contas criadas em outros apps não têm perfil aqui e não conseguem gravar (testado).

## Arquitetura

```
Navegador ─(texto do CSV)─► Server Action ─► parser + impressões digitais (TS) ─► prévia
                                   └─(confirmação)─► financas.import_transactions (PL/pgSQL, atômica)
Painel / exportação ─► funções SQL de resumo (security invoker, RLS) ─► Postgres (schema financas)
```

**Tecnologias:** Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth,
RLS) · Zod · Sentry · Vitest · PGlite · GitHub Actions · Vercel.

## Como executar

```bash
pnpm install
cp .env.example .env.local   # chaves do seu projeto Supabase
```

1. No Supabase, **Project Settings → API → Exposed schemas**: adicione `financas`.
2. Aplique `supabase/migrations/` (SQL Editor ou `supabase db push`).
3. `pnpm seed:demo` cria a conta demo com dois extratos importados.
4. `pnpm dev` → http://localhost:3000

## Testes

```bash
pnpm test                       # parser, filtros, regras, dinheiro, CSV e banco (PGlite)
pnpm lint && pnpm typecheck && pnpm build
```

## Limitações

- Somente CSV em UTF-8 (OFX e Excel não são lidos; arquivos em Latin-1 recebem mensagem clara).
- Datas ambíguas são interpretadas no padrão brasileiro (dd/mm), não no americano (mm/dd).
- “1,234” sem casas decimais é lido como mil duzentos e trinta e quatro.
- Editar a descrição de uma transação importada não altera sua impressão digital.
- Transferências entre contas próprias aparecem como despesa numa e receita na outra.

## Melhorias futuras

Mapeamento manual de colunas na prévia · importação OFX · transferências vinculadas · orçamento
por categoria · testes E2E com Playwright.

## Guia de estudo

[docs/guia-de-estudo.md](docs/guia-de-estudo.md)

## Transparência sobre o uso de IA

Código, testes e documentação produzidos com assistência do Claude Code (Anthropic), sob minha
direção e revisão. As decisões estão registradas aqui e no histórico de commits.
