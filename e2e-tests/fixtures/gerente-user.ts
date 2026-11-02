import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

export type GerenteTestUser = {
  id: string;
  email: string;
  password: string;
};

export function createGerenteAdminClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error("SUPABASE_URL e SUPABASE_SECRET_KEY são obrigatórios para criar o usuário de teste Gerente.");
  }

  return createClient(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Cria um Gerente novo por caso/retry. O gatilho `handle_new_user` monta o perfil a
 * partir do `user_metadata` (nome e role), então é daqui que vem o perfil 'gerente'.
 */
export async function createGerenteTestUser(admin: SupabaseClient): Promise<GerenteTestUser> {
  const email = `dyad.teste.gerente.${randomUUID()}@example.com`;
  const password = `Aa1!${randomUUID()}z`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nome: "Teste Gerente", role: "gerente" },
  });

  if (error) throw error;
  if (!data.user?.id) throw new Error("O Supabase não retornou o id do usuário Gerente de teste.");

  return { id: data.user.id, email, password };
}

/** Entra pela tela de login e espera o destino inicial do Gerente. */
export async function signInAsGerente(page: Page, user: GerenteTestUser): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("#email").fill(user.email);
  await page.locator("#password").fill(user.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/conciliacao", { timeout: 60_000 });
}

export async function cleanupGerenteTestUser(admin: SupabaseClient, userId: string): Promise<void> {
  const { error: launchesError } = await admin
    .from("lancamentos_financeiros")
    .delete()
    .eq("user_id", userId);
  if (launchesError) throw launchesError;

  const { error: userError } = await admin.auth.admin.deleteUser(userId);
  if (userError) throw userError;
}
