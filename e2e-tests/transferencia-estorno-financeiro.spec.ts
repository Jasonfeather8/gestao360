import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupMasterTestUser,
  createMasterAdminClient,
  createMasterTestUser,
  signInAsMaster,
  type MasterTestUser,
} from "./fixtures/master-user";
import { searchField, uniqueMarker } from "./fixtures/contas-a-pagar";

test.setTimeout(120_000);

let admin: SupabaseClient | undefined;
let master: MasterTestUser | undefined;

test.beforeEach(async ({ page }) => {
  admin = createMasterAdminClient();
  master = await createMasterTestUser(admin);
  await signInAsMaster(page, master);
});

test.afterEach(async ({ page }) => {
  if (admin && master) {
    try {
      await cleanupMasterTestUser(admin, master.id, page);
    } finally {
      admin = undefined;
      master = undefined;
    }
  }
});

test("Master estorna o título da transferência no Financeiro e ela volta a aguardar confirmação", async ({ page }) => {
  const observationMarker = uniqueMarker("TRANSFERENCIA ESTORNO NO FINANCEIRO");
  await page.goto("/conciliacao?aba=transferencias", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Transferências", exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Nova transferência" })).toBeVisible({ timeout: 30_000 });

  const origem = page.locator("#transferencia-origem");
  const destino = page.locator("#transferencia-destino");
  await expect(origem.locator("option").nth(2)).toBeAttached({ timeout: 30_000 });
  const contas = await origem.locator("option").evaluateAll((options) => options
    .map((option) => {
      const elemento = option as HTMLOptionElement;
      return { id: elemento.value, nome: elemento.textContent?.trim() ?? "" };
    })
    .filter((conta) => conta.id));

  const valor = 123.45;
  let contaOrigem: { id: string; nome: string } | undefined;
  for (const conta of contas) {
    const saldoTexto = await page.getByTestId("account-card")
      .filter({ hasText: conta.nome })
      .first()
      .getByText("Operacional", { exact: true })
      .locator("xpath=..")
      .locator("p")
      .innerText();
    const saldoOperacional = Number(saldoTexto.replace("R$", "").replace(/\./g, "").replace(",", ".").trim());
    if (saldoOperacional >= valor) {
      contaOrigem = conta;
      break;
    }
  }
  expect(contaOrigem, "deve haver uma conta com saldo operacional suficiente para o teste").toBeDefined();
  const contaDestino = contas.find((conta) => conta.id !== contaOrigem!.id);
  expect(contaDestino, "deve haver uma segunda conta bancária").toBeDefined();

  await origem.selectOption(contaOrigem!.id);
  await destino.selectOption(contaDestino!.id);
  await page.locator("#transferencia-valor").fill("12345");
  await page.locator("#transferencia-observacao").fill(observationMarker);
  await page.getByRole("button", { name: "Registrar transferência" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Transferência registrada" })).toBeVisible({ timeout: 30_000 });

  const { data: launches, error: launchesError } = await admin!
    .from("lancamentos_financeiros")
    .select("transferencia_id")
    .eq("user_id", master!.id)
    .like("observacoes", `%${observationMarker}%`);
  if (launchesError) throw launchesError;
  const transferenciaIds = [...new Set((launches ?? [])
    .map((launch) => launch.transferencia_id)
    .filter((id): id is string => Boolean(id)))];
  expect(transferenciaIds).toHaveLength(1);

  const transferenciaCard = page.getByTestId(`transferencia-${transferenciaIds[0]}`);
  await transferenciaCard.getByRole("button", { name: "Confirmar", exact: true }).click({ timeout: 30_000 });
  const modalConfirmacao = page.getByRole("dialog");
  await expect(modalConfirmacao.getByRole("heading", { name: "Confirmar dados da transferência" })).toBeVisible();
  await modalConfirmacao.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(modalConfirmacao).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("status").filter({ hasText: "Dados da transferência confirmados." })).toBeVisible();

  // Os dois títulos da transferência entram no Financeiro aguardando o Master.
  await page.goto("/lancamentos", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await searchField(page).fill(observationMarker);
  const linhas = page.getByRole("row").filter({ hasText: "123,45" });
  await expect(linhas).toHaveCount(2, { timeout: 30_000 });

  // Estorno do título pelo menu ⋮ do Financeiro.
  await linhas.first().getByTestId("lancamento-action-menu").click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByTestId("action-estornar").click();
  await expect(linhas).toHaveCount(1, { timeout: 30_000 });

  const { data: transferencia, error: transferenciaError } = await admin!
    .from("transferencias_bancarias")
    .select("status, confirmado_em")
    .eq("id", transferenciaIds[0])
    .single();
  if (transferenciaError) throw transferenciaError;
  expect(transferencia.status).toBe("aberta");
  expect(transferencia.confirmado_em).toBeNull();

  const { data: titulos, error: titulosError } = await admin!
    .from("lancamentos_financeiros")
    .select("status_pagamento, valor_recebido")
    .like("observacoes", `%${observationMarker}%`);
  if (titulosError) throw titulosError;
  const estornados = (titulos ?? []).filter((titulo) => titulo.status_pagamento === "aberto" && Number(titulo.valor_recebido) === 0);
  expect(estornados, "o título estornado fica aberto e sem valor recebido").toHaveLength(1);

  // A transferência volta para "Aguardando Confirmação" e pode ser confirmada de novo.
  await page.goto("/conciliacao?aba=transferencias", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Transferências registradas" })).toBeVisible({ timeout: 30_000 });
  await expect(transferenciaCard.getByText("Aguardando Confirmação", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(transferenciaCard.getByRole("button", { name: "Confirmar", exact: true })).toBeVisible();
});
