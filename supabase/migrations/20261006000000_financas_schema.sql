-- Projeto 3 — Gestão financeira com dashboard
-- Schema isolado `financas` (projeto Supabase compartilhado com outras demos; ver PLANO.md do portfólio).
-- Dados por usuário: RLS user_id = auth.uid() e FKs compostas (user_id, id).

create schema if not exists financas;

create type financas.account_type as enum ('corrente', 'poupanca', 'cartao', 'carteira', 'investimento');
create type financas.category_kind as enum ('receita', 'despesa');
create type financas.rule_match as enum ('contem', 'comeca_com', 'igual');

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

-- Marca o usuário como usuário deste app (contas de outros apps do portfólio não têm perfil aqui).
create table financas.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null check (char_length(full_name) between 2 and 100),
  created_at  timestamptz not null default now()
);

create table financas.accounts (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references financas.profiles (id) on delete cascade,
  name                   text not null check (char_length(name) between 2 and 60),
  type                   financas.account_type not null default 'corrente',
  initial_balance_cents  bigint not null default 0 check (abs(initial_balance_cents) <= 100000000000),
  archived               boolean not null default false,
  created_at             timestamptz not null default now(),
  unique (user_id, id)
);
create unique index accounts_user_name on financas.accounts (user_id, lower(name));

create table financas.categories (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null references financas.profiles (id) on delete cascade,
  name     text not null check (char_length(name) between 2 and 40),
  kind     financas.category_kind not null,
  color    text not null default '#64748b' check (color ~ '^#[0-9a-f]{6}$'),
  unique (user_id, id)
);
create unique index categories_user_kind_name on financas.categories (user_id, kind, lower(name));

create table financas.imports (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references financas.profiles (id) on delete cascade,
  account_id      uuid not null,
  filename        text not null check (char_length(filename) between 1 and 200),
  total_rows      int not null check (total_rows >= 0),
  imported_rows   int not null default 0,
  duplicate_rows  int not null default 0,
  invalid_rows    int not null default 0,
  created_at      timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, account_id) references financas.accounts (user_id, id) on delete cascade
);

create table financas.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references financas.profiles (id) on delete cascade,
  account_id    uuid not null,
  category_id   uuid,
  import_id     uuid,
  occurred_on   date not null check (occurred_on between date '1990-01-01' and date '2100-12-31'),
  description   text not null check (char_length(description) between 1 and 200),
  amount_cents  bigint not null check (amount_cents <> 0 and abs(amount_cents) <= 100000000000),
  -- Impressão digital da linha importada (null em lançamentos manuais).
  fingerprint   text check (fingerprint is null or fingerprint ~ '^[0-9a-f]{64}$'),
  notes         text check (char_length(notes) <= 300),
  created_at    timestamptz not null default now(),
  unique (account_id, fingerprint),
  foreign key (user_id, account_id) references financas.accounts (user_id, id) on delete cascade,
  foreign key (user_id, category_id) references financas.categories (user_id, id) on delete set null (category_id),
  foreign key (user_id, import_id) references financas.imports (user_id, id) on delete set null (import_id)
);
create index on financas.transactions (user_id, occurred_on desc);
create index on financas.transactions (user_id, category_id);
create index on financas.transactions (account_id, occurred_on);

create table financas.category_rules (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references financas.profiles (id) on delete cascade,
  pattern      text not null check (char_length(pattern) between 2 and 100),
  match        financas.rule_match not null default 'contem',
  category_id  uuid not null,
  priority     int not null default 100 check (priority between 1 and 1000),
  created_at   timestamptz not null default now(),
  foreign key (user_id, category_id) references financas.categories (user_id, id) on delete cascade
);
create index on financas.category_rules (user_id, priority);

-- ---------------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------------

-- Normalização para comparar descrições: minúsculas, sem acentos e com espaços simples.
create or replace function financas.normalize(p text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select regexp_replace(
    translate(lower(coalesce(p, '')),
              'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
    '\s+', ' ', 'g')
$$;

create or replace function financas.is_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from financas.profiles where id = auth.uid())
$$;

-- Categoria sugerida pela regra de maior prioridade (menor número), depois a mais antiga.
create or replace function financas.match_category(p_description text)
returns uuid language sql stable security invoker set search_path = '' as $$
  select r.category_id
  from financas.category_rules r
  where r.user_id = auth.uid()
    and case r.match
          when 'contem'     then strpos(financas.normalize(p_description), financas.normalize(r.pattern)) > 0
          when 'comeca_com' then left(financas.normalize(p_description), char_length(financas.normalize(r.pattern))) = financas.normalize(r.pattern)
          when 'igual'      then financas.normalize(p_description) = financas.normalize(r.pattern)
        end
  order by r.priority, r.created_at
  limit 1
$$;

-- Importação atômica de linhas já validadas no servidor da aplicação.
-- Duplicadas (mesma impressão digital na conta) são ignoradas pelo índice único.
create or replace function financas.import_transactions(
  p_account uuid, p_filename text, p_rows jsonb, p_invalid_rows int default 0)
returns table (import_id uuid, imported int, duplicates int)
language plpgsql security invoker set search_path = '' as $$
declare
  v_import   uuid;
  v_total    int;
  v_imported int;
begin
  if auth.uid() is null or not financas.is_user() then
    raise exception 'NAO_AUTENTICADO' using errcode = '28000';
  end if;
  if not exists (select 1 from financas.accounts where id = p_account and user_id = auth.uid() and not archived) then
    raise exception 'CONTA_INVALIDA' using errcode = '22023';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'ARQUIVO_VAZIO' using errcode = '22023';
  end if;
  v_total := jsonb_array_length(p_rows);
  if v_total = 0 then
    raise exception 'ARQUIVO_VAZIO' using errcode = '22023';
  end if;
  if v_total > 5000 then
    raise exception 'ARQUIVO_GRANDE_DEMAIS' using errcode = '22023';
  end if;

  insert into financas.imports (user_id, account_id, filename, total_rows, invalid_rows)
  values (auth.uid(), p_account, left(p_filename, 200), v_total + coalesce(p_invalid_rows, 0), coalesce(p_invalid_rows, 0))
  returning id into v_import;

  insert into financas.transactions (user_id, account_id, category_id, import_id, occurred_on, description, amount_cents, fingerprint)
  select auth.uid(), p_account,
         coalesce(
           (select c.id from financas.categories c where c.id = r.category_id and c.user_id = auth.uid()),
           financas.match_category(r.description)),
         v_import, r.occurred_on, left(trim(r.description), 200), r.amount_cents, r.fingerprint
  from jsonb_to_recordset(p_rows) as r(occurred_on date, description text, amount_cents bigint, fingerprint text, category_id uuid)
  on conflict (account_id, fingerprint) do nothing;
  get diagnostics v_imported = row_count;

  update financas.imports set imported_rows = v_imported, duplicate_rows = v_total - v_imported where id = v_import;
  return query select v_import, v_imported, v_total - v_imported;
end $$;

-- Reaplica as regras às transações sem categoria do usuário.
create or replace function financas.apply_rules()
returns int language plpgsql security invoker set search_path = '' as $$
declare
  v_count int;
begin
  update financas.transactions t
  set category_id = financas.match_category(t.description)
  where t.user_id = auth.uid() and t.category_id is null
    and financas.match_category(t.description) is not null;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Resumo mensal (receitas e despesas) com filtros opcionais. RLS restringe ao usuário.
create or replace function financas.summary_monthly(
  p_from date, p_to date, p_account uuid default null, p_category uuid default null)
returns table (month date, income_cents bigint, expense_cents bigint)
language sql stable security invoker set search_path = '' as $$
  select date_trunc('month', t.occurred_on)::date,
         coalesce(sum(t.amount_cents) filter (where t.amount_cents > 0), 0)::bigint,
         coalesce(-sum(t.amount_cents) filter (where t.amount_cents < 0), 0)::bigint
  from financas.transactions t
  where t.user_id = auth.uid()
    and t.occurred_on between p_from and p_to
    and (p_account is null or t.account_id = p_account)
    and (p_category is null or t.category_id = p_category)
  group by 1
  order by 1
$$;

-- Totais por categoria (p_sign: -1 despesas, 1 receitas). Sem categoria aparece como null.
create or replace function financas.summary_by_category(
  p_from date, p_to date, p_sign int, p_account uuid default null)
returns table (category_id uuid, name text, color text, total_cents bigint, tx_count bigint)
language sql stable security invoker set search_path = '' as $$
  select c.id, coalesce(c.name, 'Sem categoria'), coalesce(c.color, '#94a3b8'),
         abs(sum(t.amount_cents))::bigint, count(*)
  from financas.transactions t
  left join financas.categories c on c.id = t.category_id
  where t.user_id = auth.uid()
    and t.occurred_on between p_from and p_to
    and sign(t.amount_cents) = sign(p_sign)
    and (p_account is null or t.account_id = p_account)
  group by c.id, c.name, c.color
  order by 4 desc
$$;

-- Saldo atual de cada conta = saldo inicial + soma de todas as transações.
create or replace function financas.account_balances()
returns table (account_id uuid, name text, type financas.account_type, archived boolean, balance_cents bigint)
language sql stable security invoker set search_path = '' as $$
  select a.id, a.name, a.type, a.archived,
         (a.initial_balance_cents + coalesce(sum(t.amount_cents), 0))::bigint
  from financas.accounts a
  left join financas.transactions t on t.account_id = a.id
  where a.user_id = auth.uid()
  group by a.id
  order by a.archived, a.name
$$;

-- Categorias, regras e conta padrão para um novo usuário (dados fictícios).
create or replace function financas.setup_defaults(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v record;
begin
  insert into financas.accounts (user_id, name, type) values (p_user, 'Conta corrente', 'corrente');
  insert into financas.categories (user_id, name, kind, color) values
    (p_user, 'Salário', 'receita', '#15803d'),
    (p_user, 'Freelance', 'receita', '#0d9488'),
    (p_user, 'Outras receitas', 'receita', '#65a30d'),
    (p_user, 'Mercado', 'despesa', '#c2410c'),
    (p_user, 'Moradia', 'despesa', '#7c3aed'),
    (p_user, 'Transporte', 'despesa', '#2563eb'),
    (p_user, 'Restaurantes', 'despesa', '#db2777'),
    (p_user, 'Saúde', 'despesa', '#dc2626'),
    (p_user, 'Lazer', 'despesa', '#ca8a04'),
    (p_user, 'Assinaturas', 'despesa', '#4f46e5'),
    (p_user, 'Outras despesas', 'despesa', '#64748b');
  for v in
    select * from (values
      ('salario', 'Salário', 10), ('pix recebido', 'Freelance', 50),
      ('supermercado', 'Mercado', 10), ('mercado', 'Mercado', 20), ('padaria', 'Mercado', 30),
      ('aluguel', 'Moradia', 10), ('condominio', 'Moradia', 10), ('energia', 'Moradia', 20), ('internet', 'Moradia', 20),
      ('posto', 'Transporte', 10), ('combustivel', 'Transporte', 10), ('app transporte', 'Transporte', 10),
      ('restaurante', 'Restaurantes', 10), ('lanchonete', 'Restaurantes', 20),
      ('farmacia', 'Saúde', 10), ('cinema', 'Lazer', 10), ('streaming', 'Assinaturas', 10)
    ) as x(pattern, category, priority)
  loop
    insert into financas.category_rules (user_id, pattern, match, category_id, priority)
    select p_user, v.pattern, 'contem', c.id, v.priority
    from financas.categories c where c.user_id = p_user and c.name = v.category;
  end loop;
end $$;

create or replace function financas.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  if new.raw_user_meta_data ->> 'app' is distinct from 'financas' then
    return new;
  end if;
  v_name := left(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 100);
  if char_length(v_name) < 2 then v_name := 'Usuário'; end if;
  insert into financas.profiles (id, full_name) values (new.id, v_name);
  perform financas.setup_defaults(new.id);
  return new;
end $$;

create trigger financas_on_auth_user_created
  after insert on auth.users
  for each row execute function financas.handle_new_user();

-- ---------------------------------------------------------------------------
-- Privilégios e RLS
-- ---------------------------------------------------------------------------

grant usage on schema financas to authenticated, service_role;
revoke all on all functions in schema financas from public;
revoke all on all tables in schema financas from anon, authenticated;

grant select, insert, update, delete on financas.accounts, financas.categories, financas.transactions,
  financas.category_rules to authenticated;
grant select on financas.profiles, financas.imports to authenticated;
grant insert (user_id, account_id, filename, total_rows, invalid_rows) on financas.imports to authenticated;
grant update (imported_rows, duplicate_rows) on financas.imports to authenticated;
grant update (full_name) on financas.profiles to authenticated;
grant all on all tables in schema financas to service_role;

grant execute on function financas.normalize(text), financas.is_user(), financas.match_category(text),
  financas.import_transactions(uuid, text, jsonb, int), financas.apply_rules(),
  financas.summary_monthly(date, date, uuid, uuid), financas.summary_by_category(date, date, int, uuid),
  financas.account_balances() to authenticated;
grant execute on function financas.setup_defaults(uuid) to service_role;

alter table financas.profiles       enable row level security;
alter table financas.accounts       enable row level security;
alter table financas.categories     enable row level security;
alter table financas.imports        enable row level security;
alter table financas.transactions   enable row level security;
alter table financas.category_rules enable row level security;

create policy "perfil: o próprio" on financas.profiles for select to authenticated using (id = auth.uid());
create policy "perfil: edita o próprio" on financas.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Todas as tabelas de dados: somente o dono, e somente usuários deste app.
create policy "dono" on financas.accounts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and financas.is_user());
create policy "dono" on financas.categories for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and financas.is_user());
create policy "dono" on financas.transactions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and financas.is_user());
create policy "dono" on financas.category_rules for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and financas.is_user());
create policy "dono: leitura" on financas.imports for select to authenticated using (user_id = auth.uid());
create policy "dono: criação" on financas.imports for insert to authenticated
  with check (user_id = auth.uid() and financas.is_user());
create policy "dono: contagens" on financas.imports for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
