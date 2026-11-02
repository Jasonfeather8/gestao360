import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

export type ColaboradorTestUser = {
  id: string;
  email: string;
  password: string;
};

export function createColaboradorAdminClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    throw new Error("SUPABASE_URL e SUPABASE_SECRET_KEY são obrigatórios para criar o usuário de teste Colaborador.");
  }
  return createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function createColaboradorTestUser(admin: SupabaseClient, contasLiberadas: string[]): Promise<ColaboradorTestUser> {
  const email = `dyad.teste.colaborador.${randomUUID()}@example.com`;
  const password = `Aa1!${randomUUID()}z`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nome: "Teste Colaborador", role: "colaborador" },
  });
  if (error) throw error;
  if (!data.user?.id) throw new Error("O Supabase não retornou o id do usuário Colaborador de teste.");

  const { error: profileError } = await admin
    .from("profiles")
    .update({ contas_liberadas: contasLiberadas })
    .eq("id", data.user.id);
  if (profileError) throw profileError;
  return { id: data.user.id, email, password };
}

export async function createContaBancaria(admin: SupabaseClient, nome: string): Promise<string> {
  const { data, error } = await admin
    .from("contas_bancarias")
    .insert({ nome, nome_banco: nome, status: "ativo", saldo_inicial: 0, is_cofre_local: false })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function createLancamentoAberto(
  admin: SupabaseClient,
  { contaId, userId, valor = 123.45 }: { contaId: string; userId: string; valor?: number },
): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await admin
    .from("lancamentos_financeiros")
    .insert({
      user_id: userId,
      usuario_criador_id: userId,
      tipo: "saida",
      valor_previsto: valor,
      valor_original: valor,
      data_vencimento: today,
      data_emissao: today,
      data_competencia: today,
      conta_bancaria_id: contaId,
      status_aprovacao: "digital",
      status_pagamento: "aberto",
      valor_recebido: 0,
      tipo_baixa: "financeira",
      observacoes: `Teste colaborador ${randomUUID()}`,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function signInAsColaborador(page: Page, user: ColaboradorTestUser): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("#email").fill(user.email);
  await page.locator("#password").fill(user.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL("**/pagar", { timeout: 60_000 });
}

export async function cleanupColaboradorTestUser(
  admin: SupabaseClient,
  { userId, lancamentoIds, contaIds }: { userId: string; lancamentoIds: string[]; contaIds: string[] },
): Promise<void> {
  let firstError: unknown;
  const attempt = async (operation: () => PromiseLike<{ error: any }>) => {
    try {
      const { error } = await operation();
      if (error && !firstError) firstError = error;
    } catch (error) {
      if (!firstError) firstError = error;
    }
  };

  if (lancamentoIds.length) {
    // O gatilho de novo lançamento notifica os Masters: a notificação precisa sair
    // junto com o título para não deixar aviso apontando para registro inexistente.
    await attempt(() =>
      admin.from("notifications").delete().in("link", lancamentoIds.map(id => `/lancamentos?id=${id}`)),
    );
    await attempt(() => admin.from("lancamentos_financeiros").delete().in("id", lancamentoIds));
  }
  if (contaIds.length) {
    await attempt(() => admin.from("contas_bancarias").delete().in("id", contaIds));
  }
  await attempt(async () => {
    const { error } = await admin.auth.admin.deleteUser(userId);
    return { error };
  });
  if (firstError) throw firstError;
}
