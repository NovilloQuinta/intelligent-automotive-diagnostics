import { test, expect } from "@playwright/test";

const UNIQUE_SUFFIX = Date.now().toString(36);
const TEST_USER = {
  username: `e2e_${UNIQUE_SUFFIX}`,
  email: `e2e_${UNIQUE_SUFFIX}@test.com`,
  password: "password123",
};

test.describe("Authentication", () => {
  test("should register a new user and redirect to dashboard", async ({ page }) => {
    await page.goto("/login");

    // Switch to register tab
    await page.getByRole("tab", { name: "Registrarse" }).click();
    await expect(page.getByText("Crear cuenta")).toBeVisible();

    // Fill form
    await page.locator("#reg-username").fill(TEST_USER.username);
    await page.locator("#reg-email").fill(TEST_USER.email);
    await page.locator("#reg-password").fill(TEST_USER.password);
    await page.getByRole("button", { name: "Crear cuenta" }).click();

    // Should redirect to dashboard
    await expect(page).toHaveURL("/");
    await expect(page.getByText("Telemetría en vivo")).toBeVisible();
  });

  test("should login with valid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.getByPlaceholder("tu@email.com").fill(TEST_USER.email);
    await page.getByPlaceholder("••••••••").fill(TEST_USER.password);
    await page.locator('button[type="submit"]').click();

    // Should redirect to dashboard
    await expect(page).toHaveURL("/");
    await expect(page.getByText("Telemetría en vivo")).toBeVisible();
    await expect(page.getByText("Conectado")).toBeVisible();
  });

  test("should show error with invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.getByPlaceholder("tu@email.com").fill("no@existe.com");
    await page.getByPlaceholder("••••••••").fill("wrongpassword");
    await page.locator('button[type="submit"]').click();

    // Should show error and stay on login page
    await expect(page.locator(".text-destructive").first()).toBeVisible({ timeout: 10000 });
    await expect(page).toHaveURL("/login");
  });
});
