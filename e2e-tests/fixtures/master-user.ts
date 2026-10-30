import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

export type MasterTestUser = {
  id: string;
  email: string;
  password: string;
};

const MASTER_TEST_EMAIL = "dyad.teste.master@example.com";

export function createMasterAdminClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    throw new Error("SUPABASE_URL e SUPABASE_SECRET_KEY são obrigatórios para criar o usuário de teste Master.");
  }

  return createClient(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function createMasterTestUser(admin: SupabaseClient): Promise<MasterTestUser> {
  const password = `Aa1!${randomUUID()}z`;
  const { data: usersData, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) throw listError;

  const existingUser = (usersData.users as User[]).find((user) => user.email === MASTER_TEST_EMAIL);
  let userId: string;

  if (existingUser) {
    const { error } = await admin.auth.admin.updateUserById(existingUser.id, { password });
    if (error) throw error;
    userId = existingUser.id;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: MASTER_TEST_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { nome: "Teste Master", role: "master" },
    });

    if (error) throw error;
    if (!data.user?.id) throw new Error("O Supabase não retornou o id do usuário Master de teste.");
    userId = data.user.id;
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ role: "master", status: true })
    .eq("id", userId);
  if (profileError) throw profileError;

  return { id: userId, email: MASTER_TEST_EMAIL, password };
}

export async function signInAsMaster(page: Page, user: MasterTestUser): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("#email").fill(user.email);
  await page.locator("#password").fill(user.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/dashboard", { timeout: 60_000 });
}

export async function cleanupMasterTestUser(admin: SupabaseClient, userId: string, page?: Page): Promise<void> {
  try {
    const { data: transfers, error: transfersError } = await admin
      .from("transferencias_bancarias")
      .select("id")
      .eq("criado_por", userId);
    if (transfersError) throw transfersError;

    // Estorna pela própria tela (quando a página está disponível) para desfazer a
    // movimentação pelo fluxo do app; os registros são apagados logo abaixo de
    // qualquer forma, então o saldo das contas volta ao estado anterior.
    if (transfers?.length && page) {
      await page.goto("/conciliacao?aba=transferencias", { waitUntil: "domcontentloaded", timeout: 60_000 });
      await expect(page.getByRole("heading", { name: "Transferências registradas" })).toBeVisible({ timeout: 30_000 });
      for (const transfer of transfers) {
        const card = page.getByTestId(`transferencia-${transfer.id}`);
        await expect(card).toBeVisible({ timeout: 30_000 });
        const estornar = card.getByRole("button", { name: "Estornar", exact: true });
        if (await estornar.count()) {
          await estornar.click();
          const modal = page.getByRole("dialog");
          await modal.getByRole("textbox", { name: /Justificativa/ }).fill("Limpeza automática do teste e2e.");
          await modal.getByRole("button", { name: "Estornar", exact: true }).click();
          await expect(modal).toBeHidden({ timeout: 30_000 });
        }
      }
    }

    for (const transfer of transfers ?? []) {
      const { error: notificationError } = await admin
        .from("notifications")
        .delete()
        .eq("origem", "transferencia_bancaria")
        .like("message", `%${transfer.id}%`);
      if (notificationError) throw notificationError;

      const { error: transferError } = await admin
        .from("transferencias_bancarias")
        .delete()
        .eq("id", transfer.id)
        .eq("criado_por", userId);
      if (transferError) throw transferError;
    }

    const { data: launches, error: launchesError } = await admin
      .from("lancamentos_financeiros")
      .select("id")
      .eq("user_id", userId);
    if (launchesError) throw launchesError;

    for (const launch of launches ?? []) {
      const { error } = await admin
        .from("notifications")
        .delete()
        .eq("origem", "lancamento_novo")
        .like("link", `%${launch.id}%`);
      if (error) throw error;
    }

    const { error: launchDeleteError } = await admin
      .from("lancamentos_financeiros")
      .delete()
      .eq("user_id", userId);
    if (launchDeleteError) throw launchDeleteError;

    const { error: recurrenceDeleteError } = await admin.from("recorrencias").delete().eq("user_id", userId);
    if (recurrenceDeleteError) throw recurrenceDeleteError;
  } finally {
    const { error: profileError } = await admin
      .from("profiles")
      .update({ role: "colaborador", status: false })
      .eq("id", userId);
    if (profileError) throw profileError;
  }
}
