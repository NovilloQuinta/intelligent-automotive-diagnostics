import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

const SUFFIX = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/**
 * Completes the vehicle identification wizard: picks a connection, waits for
 * the VIN read and confirms the identified vehicle to enter the diagnosis menu.
 */
async function identifyVehicle(page: Page, name: RegExp) {
  await expect(page.getByText("Identificación del vehículo")).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole("button", { name }).click();
  const enterBtn = page.getByRole("button", { name: "Entrar a diagnóstico" });
  await expect(enterBtn).toBeVisible({ timeout: 15000 });
  await enterBtn.click();
  await expect(page.getByText("Telemetría en vivo")).toBeVisible({
    timeout: 15000,
  });
}

async function registerAndLogin(page: Page, suffix: string) {
  const email = `e2edash_${suffix}@test.com`;
  await page.goto("/login");
  await page.getByRole("tab", { name: "Registrarse" }).click();
  await page.locator("#reg-username").fill(`e2edash_${suffix}`);
  await page.locator("#reg-email").fill(email);
  await page.locator("#reg-password").fill("Password123!");
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL("/", { timeout: 15000 });
  // El menú de diagnóstico está detrás del wizard de identificación
  await identifyVehicle(page, /Audi A3/);
}

/** Reopens the wizard from the TopBar dropdown and identifies another vehicle. */
async function switchVehicle(page: Page, current: RegExp, next: RegExp) {
  await page.getByRole("button", { name: current }).first().click();
  await page.getByRole("button", { name: next }).first().click();
  // The dropdown selection already triggers the VIN read; go straight to confirm.
  const enterBtn = page.getByRole("button", { name: "Entrar a diagnóstico" });
  await expect(enterBtn).toBeVisible({ timeout: 15000 });
  await enterBtn.click();
  await expect(page.getByText("Telemetría en vivo")).toBeVisible({ timeout: 15000 });
}

test.describe("Dashboard", () => {
  test("should identify the vehicle before entering the diagnosis menu", async ({
    page,
  }) => {
    const suffix = `wizard_${SUFFIX}`;
    await page.goto("/login");
    await page.getByRole("tab", { name: "Registrarse" }).click();
    await page.locator("#reg-username").fill(`e2edash_${suffix}`);
    await page.locator("#reg-email").fill(`e2edash_${suffix}@test.com`);
    await page.locator("#reg-password").fill("Password123!");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page).toHaveURL("/", { timeout: 15000 });

    // Wizard first: no telemetry until the VIN is read and confirmed
    await expect(page.getByText("Identificación del vehículo")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("Telemetría en vivo")).toBeHidden();

    await page.getByRole("button", { name: /Audi A3/ }).click();
    await expect(page.getByText("VIN leído")).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "Entrar a diagnóstico" }).click();

    await expect(page.getByText("Telemetría en vivo")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("Identificación del vehículo")).toBeHidden();
  });

  test("should switch vehicle from Audi to Kawasaki", async ({ page }) => {
    await registerAndLogin(page, `switch_${SUFFIX}`);

    // Verify default vehicle
    await expect(page.getByText("Audi A3 2.0 TDI").first()).toBeVisible();

    // Changing vehicle goes through the identification wizard again
    await switchVehicle(page, /Audi A3/, /Kawasaki Z900/);

    // Vehicle changed
    await expect(
      page.getByRole("button", { name: /Kawasaki Z900/ }).first(),
    ).toBeVisible();
  });

  test("should run diagnosis on Audi (with DTCs)", async ({ page }) => {
    await registerAndLogin(page, `audi_${SUFFIX}`);

    // Run diagnosis
    await page.getByRole("button", { name: "Iniciar diagnóstico" }).click();

    // Open the DTC section — the diagnosis populates the stored codes
    await page.getByRole("button", { name: /Códigos DTC/ }).click();
    await expect(page.getByText("P0301").first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("P0401").first()).toBeVisible();
    await expect(page.getByText("P2002").first()).toBeVisible();
    await expect(page.getByText("3 registrados")).toBeVisible();
  });

  test("should run diagnosis on Kawasaki (no DTCs)", async ({ page }) => {
    await registerAndLogin(page, `kawa_${SUFFIX}`);

    // Switch to Kawasaki through the wizard
    await switchVehicle(page, /Audi A3/, /Kawasaki Z900/);

    // Run diagnosis and wait for it to complete
    await page.getByRole("button", { name: "Iniciar diagnóstico" }).click();
    await expect(page.getByText("Diagnóstico completado")).toBeVisible({
      timeout: 15000,
    });

    // Open the DTC section — Kawasaki has no stored DTCs
    await page.getByRole("button", { name: /Códigos DTC/ }).click();
    await expect(page.getByText(/Ningún código de error/)).toBeVisible();
  });

  test("should show the freeze frame snapshot when selecting a DTC on Audi", async ({
    page,
  }) => {
    await registerAndLogin(page, `ff_${SUFFIX}`);

    // Run diagnosis to surface the DTC list
    await page.getByRole("button", { name: "Iniciar diagnóstico" }).click();
    await page.getByRole("button", { name: /Códigos DTC/ }).click();
    await expect(page.getByText("P0301").first()).toBeVisible({
      timeout: 15000,
    });

    // Select the DTC row — the Audi scenario seeds a freeze frame for P0301
    await page.getByText("P0301").first().click();

    // The freeze frame snapshot shows the RPM captured at misfire time (2100 rpm)
    await expect(page.getByText("2100").first()).toBeVisible({
      timeout: 15000,
    });
  });

  test("should show live telemetry values", async ({ page }) => {
    await registerAndLogin(page, `tele_${SUFFIX}`);

    // Telemetry section visible with numeric values
    await expect(page.getByText("RPM").first()).toBeVisible();
    await expect(page.getByText("Refrigerante")).toBeVisible();
    await expect(page.getByText("Velocidad")).toBeVisible();

    // RAW hex display present
    await expect(page.getByText(/RAW ›/)).toBeVisible();
  });
});
