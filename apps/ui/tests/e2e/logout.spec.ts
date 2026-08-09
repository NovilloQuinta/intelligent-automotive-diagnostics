import { test, expect } from "@playwright/test";

const SUFFIX = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

test.describe("Logout", () => {
  test("should logout and show the anonymous landing page", async ({
    page,
  }) => {
    // Register a fresh user
    await page.goto("/login");
    await page.getByRole("tab", { name: "Registrarse" }).click();
    await page.locator("#reg-username").fill(`e2elogout_${SUFFIX}`);
    await page.locator("#reg-email").fill(`e2elogout_${SUFFIX}@test.com`);
    await page.locator("#reg-password").fill("Password123!");
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page).toHaveURL("/", { timeout: 15000 });
    await expect(page.getByText("Telemetría en vivo")).toBeVisible();

    // Click logout
    await page.getByRole("button", { name: "Cerrar sesión" }).click();

    // Anonymous users land on the public landing page at "/"
    await expect(
      page.getByRole("link", { name: "Iniciar sesión" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Registrarse" })).toBeVisible();

    // localStorage should be clean of tokens
    const accessToken = await page.evaluate(() =>
      localStorage.getItem("iad.accessToken"),
    );
    const refreshToken = await page.evaluate(() =>
      localStorage.getItem("iad.refreshToken"),
    );
    expect(accessToken).toBeNull();
    expect(refreshToken).toBeNull();
  });
});
