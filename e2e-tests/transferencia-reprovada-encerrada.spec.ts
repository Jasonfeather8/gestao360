import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  cleanupMasterTestUser,
  createMasterAdminClient,
  createMasterTestUser,
  signInAsMaster,
  type MasterTestUser,
} from "./fixtures/master-user";
import { uniqueMarker } from "./fixtures/contas-a-pagar";

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

test("Transferência reprovada fica encerrada, sem botões e no filtro Reprovadas", async ({ page }) => {
  const observationMarker = uniqueMarker("TRANSFERENCIA REPROVADA");
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

  const card = page.getByTestId(`transferencia-${transferenciaIds[0]}`);
  await card.getByRole("button", { name: "Reprovar", exact: true }).click({ timeout: 30_000 });
  const modal = page.getByRole("dialog");
  await expect(modal.getByRole("heading", { name: "Reprovar transferência" })).toBeVisible();
  await modal.getByRole("textbox", { name: "Justificativa" }).fill("Reprovação coberta pelo teste e2e.");
  await modal.getByRole("button", { name: "Reprovar", exact: true }).click();
  await expect(modal).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("status").filter({ hasText: "Transferência reprovada." })).toBeVisible();

  const { data: transferencia, error: transferenciaError } = await admin!
    .from("transferencias_bancarias")
    .select("reprovado_em")
    .eq("id", transferenciaIds[0])
    .single();
  if (transferenciaError) throw transferenciaError;
  expect(transferencia.reprovado_em).not.toBeNull();

  // Encerrada: nenhuma ação sobra no cartão e o aviso de confirmação desaparece.
  await expect(card.getByText("Reprovada", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(card.getByRole("button", { name: "Confirmar", exact: true })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Reprovar", exact: true })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Estornar", exact: true })).toHaveCount(0);
  await expect(card.getByText(/Confirme os dados da transferência/)).toHaveCount(0);

  // Ela sai dos pendentes e passa a ser encontrada pelo filtro "Reprovadas".
  await page.getByRole("button", { name: "Pendentes de confirmação", exact: true }).click();
  await page.getByRole("button", { name: "Concluídas", exact: true }).click();
  await page.getByRole("button", { name: "Estornadas", exact: true }).click();
  await expect(card).toBeVisible();

  await page.getByRole("button", { name: "Pendentes de confirmação", exact: true }).click();
  await page.getByRole("button", { name: "Reprovadas", exact: true }).click();
  await expect(card).toBeHidden();
});
