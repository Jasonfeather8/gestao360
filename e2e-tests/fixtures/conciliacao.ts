import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Page, Request } from "@playwright/test";

/**
 * A conciliação bancária nasce apenas da importação de um extrato em PDF lido por IA, e o
 * banco bloqueia inserções diretas em `conciliacoes` (o gatilho exige a operação autorizada).
 * Para os testes que precisam de um título já conciliado, a transação bancária que o app
 * criaria na importação é semeada e a conciliação é feita pela própria RPC do app
 * (`conciliar_transacao_atomica`), com a sessão do usuário logado — as regras de perfil,
 * RLS e gatilhos continuam valendo. As asserções são sempre feitas pela tela.
 */

type TituloConciliacao = {
  id: string;
  contaId: string;
  tipo: "entrada" | "saida";
  /** Valor efetivo da baixa registrada (base da conciliação). */
  valor: number;
  /** Data da baixa: é a data da transação bancária. */
  dataPagamento: string;
};

let chavePublica: string | undefined;

function capturarChavePublica(request: Request): void {
  const apikey = request.headers()["apikey"];
  if (apikey) chavePublica = apikey;
}

/** Instala a captura da chave pública do app antes da primeira navegação. */
export function prepararConciliacao(page: Page): void {
  page.on("request", capturarChavePublica);
}

async function credenciaisDaSessao(page: Page): Promise<{ url: string; apikey: string; accessToken: string; refreshToken: string }> {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error("SUPABASE_URL é obrigatório para conciliar títulos nos testes.");

  const projectRef = new URL(url).hostname.split(".")[0];
  const sessao = await page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { access_token?: string; refresh_token?: string; currentSession?: { access_token?: string; refresh_token?: string } };
    return parsed?.currentSession ?? parsed ?? null;
  }, `sb-${projectRef}-auth-token`);

  if (!sessao?.access_token || !sessao.refresh_token) {
    throw new Error("Sessão do usuário não encontrada no navegador para conciliar o título.");
  }

  if (!chavePublica) {
    // Garante uma requisição do app para capturar a chave pública (mesma para todos os casos).
    page.on("request", capturarChavePublica);
    await page.reload({ waitUntil: "domcontentloaded" });
    for (let tentativa = 0; tentativa < 40 && !chavePublica; tentativa += 1) {
      await page.waitForTimeout(250);
    }
    page.off("request", capturarChavePublica);
  }

  if (!chavePublica) throw new Error("Chave pública do app não encontrada nas requisições da página.");

  return { url, apikey: chavePublica, accessToken: sessao.access_token, refreshToken: sessao.refresh_token };
}

/** Cliente do app autenticado como o usuário logado no navegador. */
async function clienteDoUsuario(page: Page) {
  const { url, apikey, accessToken, refreshToken } = await credenciaisDaSessao(page);
  const client = createClient(url, apikey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) throw new Error(`Não foi possível assumir a sessão do usuário: ${error.message}`);
  return client;
}

/** Dados do título criado pelo teste, localizado pelo marcador gravado em Observações. */
export async function buscarTitulo(admin: SupabaseClient, params: { userId: string; marcador: string }): Promise<TituloConciliacao> {
  const { data, error } = await admin
    .from("lancamentos_financeiros")
    .select("id, conta_bancaria_id, tipo, valor_recebido, data_pagamento")
    .eq("user_id", params.userId)
    .like("observacoes", `%${params.marcador}%`)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(`Título com o marcador "${params.marcador}" não encontrado.`);
  if (!data.conta_bancaria_id) throw new Error("O título não está vinculado a uma conta bancária.");
  if (!data.data_pagamento) throw new Error("O título não tem baixa registrada (sem data de pagamento).");

  const valorRecebido = Number(data.valor_recebido ?? 0);
  if (valorRecebido <= 0) throw new Error("O título não tem baixa registrada (valor recebido zerado).");

  return {
    id: data.id as string,
    contaId: data.conta_bancaria_id as string,
    tipo: data.tipo as "entrada" | "saida",
    valor: valorRecebido,
    dataPagamento: String(data.data_pagamento).slice(0, 10),
  };
}

/** Semeia a transação bancária que a importação do extrato produziria. */
async function semearTransacaoBancaria(admin: SupabaseClient, titulo: TituloConciliacao): Promise<string> {
  const valor = titulo.tipo === "entrada" ? titulo.valor : -titulo.valor;
  const descricao = `E2E conciliação ${titulo.id}`;

  const { data, error } = await admin
    .from("transacoes_banco")
    .insert({
      conta_bancaria_id: titulo.contaId,
      data_transacao: titulo.dataPagamento,
      valor,
      valor_centavos: Math.round(valor * 100),
      descricao_banco: descricao,
      descricao_original: descricao,
      data_original: titulo.dataPagamento,
      hash_transacao: `e2e-${randomUUID()}`,
      status_conciliacao: false,
    })
    .select("id")
    .single();

  if (error) throw error;
  if (!data?.id) throw new Error("O Supabase não devolveu o id da transação bancária semeada.");
  return data.id as string;
}

/** Concilia o título pela RPC do app, com a sessão do usuário logado na página. */
export async function conciliarTitulo(page: Page, admin: SupabaseClient, titulo: TituloConciliacao): Promise<void> {
  const transacaoId = await semearTransacaoBancaria(admin, titulo);
  const client = await clienteDoUsuario(page);

  const { error } = await client.rpc("conciliar_transacao_atomica", {
    p_transacao_id: transacaoId,
    p_lancamento_ids: [titulo.id],
  });
  if (error) throw new Error(`Não foi possível conciliar o título: ${error.message}`);
}

/**
 * Estorna (pela RPC do app) os títulos conciliados do usuário, para que a limpeza padrão
 * consiga apagá-los: o banco não permite remover uma conciliação por fora do estorno.
 */
export async function estornarTitulosConciliados(page: Page, admin: SupabaseClient, userId: string): Promise<void> {
  const { data, error } = await admin
    .from("lancamentos_financeiros")
    .select("id, conciliacoes(id)")
    .eq("user_id", userId);
  if (error) throw error;

  const conciliados = (data ?? [])
    .filter(titulo => (titulo.conciliacoes as { id: string }[] | null)?.length)
    .map(titulo => titulo.id as string);
  if (conciliados.length === 0) return;

  const client = await clienteDoUsuario(page);
  const falhas: string[] = [];
  for (const id of conciliados) {
    const { error: estornoError } = await client.rpc("estornar_lancamento_atomico", { p_lancamento_id: id });
    if (estornoError) falhas.push(`${id}: ${estornoError.message}`);
  }
  if (falhas.length > 0) throw new Error(`Falha ao desfazer conciliações do teste: ${falhas.join(" | ")}`);
}
