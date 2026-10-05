# Projeto 3 — Gestão financeira com dashboard

## Problema
Quem organiza as finanças pessoais junta extratos de bancos diferentes, cada um num formato de CSV
(separador, data e valor diferentes). Importar à mão gera duplicados, a categorização é repetitiva e
os gráficos de apps prontos não mostram o que a pessoa quer filtrar.

## Público
Pessoas que controlam as próprias finanças e trabalham com extratos exportados do banco.

## Funcionalidades
- Contas (corrente, poupança, cartão, carteira, investimento) com saldo inicial.
- Receitas e despesas (valor com sinal: + receita, − despesa) e categorias por tipo.
- **Importação de CSV** com **prévia e validação** antes de gravar.
- **Duplicados** identificados no arquivo e contra o que já foi importado.
- **Regras editáveis** de categorização (contém / começa com / igual, com prioridade).
- Filtros por período, conta e categoria; gráficos e indicadores calculados no banco.
- Exportação CSV das transações filtradas e dos resumos.

## Formatos aceitos na importação
| Aspecto | Variações tratadas |
|---|---|
| Separador | `;` `,` tabulação (detecção automática, respeita aspas) |
| Codificação | UTF-8 com/sem BOM |
| Data | `dd/mm/aaaa`, `dd/mm/aa`, `dd-mm-aaaa`, `dd.mm.aaaa`, `aaaa-mm-dd`, `aaaa/mm/dd` (data inválida como 31/02 é erro) |
| Valor | `1.234,56` · `1,234.56` · `1234.56` · `R$ -1.234,56` · `(123,45)` · `123,45 D`/`C` · colunas separadas de crédito e débito |
| Colunas | Detectadas pelo cabeçalho: data, descrição/histórico, valor/quantia, crédito/débito |

Limites: 1 MB e 5.000 linhas por arquivo.

## Regras
- Valores em centavos inteiros; conversão de texto para centavos sem ponto flutuante.
- **Impressão digital** de cada linha: conta + data + valor + descrição normalizada + ordem da
  ocorrência no arquivo (duas compras idênticas no mesmo dia são legítimas). Índice único
  `(account_id, fingerprint)`: reimportar o mesmo extrato não duplica nada.
- Importação atômica: grava tudo ou nada; registra um lote com contagens (importadas, duplicadas, inválidas).
- Erros de importação com **linha, coluna e motivo** em português (“Linha 7: data ‘31/02/2026’ não existe”).
- Categoria da linha: escolha do usuário na prévia > regra de maior prioridade > sem categoria.

## Critério essencial — isolamento
Cada usuário acessa apenas os próprios dados: RLS `user_id = auth.uid()` em todas as tabelas,
FKs compostas `(user_id, id)` (não dá para lançar em conta ou categoria de outro usuário) e testes.

## Critérios de aceite
1. Importar os 3 arquivos de exemplo mostra prévia correta (incluindo erros compreensíveis).
2. Reimportar o mesmo arquivo: 0 importadas, todas duplicadas.
3. Regras categorizam na prévia e podem ser reaplicadas às transações sem categoria.
4. Dashboard: receitas, despesas, saldo por conta, gráfico mensal e por categoria, com filtros.
5. Exportação CSV corresponde aos filtros.
6. Usuário A não lê nem altera nada de B (testes de RLS).
7. Interface responsiva e acessível; estados de carregamento, erro, sucesso e vazio.
