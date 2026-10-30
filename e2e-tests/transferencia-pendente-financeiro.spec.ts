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

test("Master confirma os dados da transferência e aprova os dois títulos pelo Financeiro", async ({ page }) => {
  const observationMarker = uniqueMarker("TRANSFERENCIA PENDENTE NO FINANCEIRO");
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
  await expect(transferenciaCard.getByRole("button", { name: "Confirmar", exact: true })).toBeVisible({ timeout: 30_000 });
  await transferenciaCard.getByRole("button", { name: "Confirmar", exact: true }).click();
  const modalConfirmacao = page.getByRole("dialog");
  await expect(modalConfirmacao.getByRole("heading", { name: "Confirmar dados da transferência" })).toBeVisible();
  await expect(modalConfirmacao.getByText(/O saldo confirmado só muda quando o Master aprovar os títulos no Financeiro/i)).toBeVisible();
  await modalConfirmacao.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(modalConfirmacao).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("status").filter({ hasText: "Dados da transferência confirmados." })).toBeVisible();
  // Confirmada, o trabalho nesta tela terminou: nenhum botão de decisão fica no cartão.
  await expect(transferenciaCard.getByRole("button", { name: "Confirmar", exact: true })).toHaveCount(0);
  await expect(transferenciaCard.getByText(/Dados confirmados em/)).toBeVisible();

  await page.goto("/lancamentos", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await searchField(page).fill(observationMarker);
  const linhas = page.getByRole("row").filter({ hasText: "123,45" });
  await expect(linhas).toHaveCount(2, { timeout: 30_000 });
  for (let index = 0; index < 2; index += 1) {
    const linha = linhas.nth(index);
    const seloPendGestor = linha.getByText("Pend. Gestor", { exact: true });
    await expect(seloPendGestor).toBeVisible();
    await seloPendGestor.click();
    await expect(page.getByRole("heading", { name: "Aprovar Título" })).toBeVisible();
    await page.getByRole("button", { name: "Confirmar Aprovação" }).click();
    await expect(page.getByRole("heading", { name: "Aprovar Título" })).toBeHidden({ timeout: 30_000 });
    await expect(linha.getByText("Pend. Gestor", { exact: true })).toHaveCount(0, { timeout: 30_000 });
  }

  const { data: transferencia, error: transferenciaError } = await admin!
    .from("transferencias_bancarias")
    .select("status")
    .eq("id", transferenciaIds[0])
    .single();
  if (transferenciaError) throw transferenciaError;
  expect(transferencia.status).toBe("conciliada");

  await page.goto("/conciliacao?aba=transferencias", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Transferências registradas" })).toBeVisible({ timeout: 30_000 });
  const cardConciliado = page.getByTestId(`transferencia-${transferenciaIds[0]}`);
  await expect(cardConciliado.getByText("Conciliada", { exact: true })).toBeVisible({ timeout: 30_000 });
});
