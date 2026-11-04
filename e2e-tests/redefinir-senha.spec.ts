import { test, expect } from "@playwright/test";

test("Usuário abre a recuperação de senha a partir do login", async ({ page }) => {
  test.setTimeout(120_000);
  let recoveryRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("auth/v1/recover")) recoveryRequests += 1;
  });

  await page.goto("/login");
  await page.getByTestId("esqueci-senha-link").click();
  await expect(page).toHaveURL(/\/esqueci-senha$/);
  await expect(page.getByTestId("email-recuperacao")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("enviar-link-redefinicao")).toBeVisible();

  await page.getByTestId("email-recuperacao").fill("sem-arroba");
  await page.getByTestId("enviar-link-redefinicao").click();
  await expect(page.getByRole("alert")).toContainText("e-mail válido");
  expect(recoveryRequests).toBe(0);
});

test("Link inválido ou expirado mostra como solicitar um novo", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/redefinir-senha");
  await expect(page).toHaveURL(/\/redefinir-senha$/);
  await expect(page.getByTestId("link-invalido")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: "Solicitar novo link" }).click();
  await expect(page).toHaveURL(/\/esqueci-senha$/);
});
