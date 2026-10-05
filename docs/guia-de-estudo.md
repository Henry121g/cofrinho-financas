# Guia de estudo — Cofrinho

## Pitch de 30 segundos
“É um app de finanças que importa extratos CSV de qualquer banco. Antes de gravar, mostra uma prévia
com erros por linha e duplicados; a importação é atômica e idempotente graças a uma impressão digital
por linha. Os gráficos são calculados no banco e cada usuário só enxerga os próprios dados.”

## Onde está cada coisa
| Assunto | Arquivo |
|---|---|
| Parser de CSV | `src/lib/statement/parse.ts` (+ `parse.test.ts`) |
| Impressão digital e prévia | `src/lib/statement/preview.ts` |
| Importação (servidor) | `src/app/importar/actions.ts` |
| Banco, RLS, funções | `supabase/migrations/20261006000000_financas_schema.sql` |
| Regras | `src/lib/rules.ts` e `financas.match_category` |
| Gráficos | `src/components/charts.tsx` |

## Perguntas prováveis

**“Como você detecta duplicados?”** Impressão digital SHA-256 + índice único + `ON CONFLICT DO
NOTHING`. Explique por que incluir a **ordem da ocorrência**: sem ela, duas compras de R$ 23,90 no
mesmo dia virariam uma só; com ela, ambas entram e a reimportação ainda é reconhecida.

**“Como saber se 1.234 é mil ou um vírgula dois três quatro?”** Regra: decimal = último separador
seguido de 1–2 dígitos; os demais agrupam de 3 em 3. “1.234” é milhar; “1,5” é decimal; “12,34,56”
é erro. Assuma a limitação: “1,234” (estilo americano sem centavos) vira mil.

**“Por que reprocessar o arquivo no servidor na confirmação?”** Nada do navegador é confiável. Se a
prévia viesse pronta do cliente, alguém poderia mandar valores ou impressões digitais arbitrárias.

**“Por que a importação é uma função SQL?”** Atomicidade (lote + transações juntos) e uma única ida
ao banco para milhares de linhas.

**“Como as regras funcionam em dois lugares sem divergir?”** Mesma normalização e mesmo desempate,
testados nos dois lados. Contraponto: duplicação de lógica é um risco; alternativa seria uma RPC que
recebe todas as descrições de uma vez.

**“Como garante isolamento?”** RLS + FKs compostas + funções `security invoker`. Mostre o teste em
que Beto tenta lançar na conta da Ana e recebe erro de FK.

## Exercícios
1. Acrescente suporte a datas mm/dd/aaaa com uma opção “formato americano” na prévia.
2. Implemente transferências entre contas próprias (par vinculado, fora dos totais de receita/despesa).
3. Troque a sugestão em TS por uma RPC em lote e compare a complexidade.
