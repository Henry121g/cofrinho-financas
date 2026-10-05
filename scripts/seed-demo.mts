// Cria/redefine a conta de demonstração com dois extratos fictícios importados.
// Uso: pnpm seed:demo   (também roda diariamente no GitHub Actions)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !serviceKey || !anonKey) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const admin = createClient(url, serviceKey, { db: { schema: "financas" }, auth: { persistSession: false } });

const EMAIL = "demo@financas.demo.test";
const PASSWORD = "demo12345"; // conta pública, só com dados fictícios

// 1) Recria o usuário (cascata apaga perfil, contas, transações e regras).
const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
const old = list.users.find((u) => u.email === EMAIL);
if (old) await admin.auth.admin.deleteUser(old.id);
const { error: createError } = await admin.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
  user_metadata: { app: "financas", full_name: "Conta Demo" }, // trigger cria padrões
});
if (createError) throw createError;

// 2) Importa os extratos como o próprio usuário (mesmo caminho da interface, com RLS).
const user = createClient(url, anonKey, { db: { schema: "financas" }, auth: { persistSession: false } });
const { error: loginError } = await user.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (loginError) throw loginError;
const { data: accounts } = await user.from("accounts").select("id").limit(1);
const accountId = accounts![0].id;

// Importa o parser do app (executado com tsx).
const { buildPreview } = await import("../src/lib/statement/preview");
for (const file of ["extrato-banco-a.csv", "extrato-banco-b.csv"]) {
  const text = readFileSync(join(import.meta.dirname, "..", "public", "exemplos", file), "utf8");
  const p = buildPreview(text, accountId, new Set());
  const rows = p.rows.map((r) => ({
    occurred_on: r.occurredOn,
    description: r.description,
    amount_cents: r.amountCents,
    fingerprint: r.fingerprint,
    category_id: null,
  }));
  const { data, error } = await user.rpc("import_transactions", { p_account: accountId, p_filename: file, p_rows: rows, p_invalid_rows: 0 });
  if (error) throw error;
  console.log(`✓ ${file}: ${data[0].imported} transações`);
}
console.log(`✓ Conta demo pronta: ${EMAIL}`);
