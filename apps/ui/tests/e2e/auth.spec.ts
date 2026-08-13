import { test, expect } from "@playwright/test";

const UNIQUE_SUFFIX = Date.now().toString(36);
const TEST_USER = {
  username: `e2e_${UNIQUE_SUFFIX}`,
  email: `e2e_${UNIQUE_SUFFIX}@test.com`,
  password: "Password123!",
};

test.describe("Authentication", () => {
  test("should register a new user and redirect to dashboard", async ({
    page,
  }) => {
    await page.goto("/login");

    // Switch to register tab
    await page.getByRole("tab", { name: "Registrarse" }).click();
    await expect(page.getByText("Crear cuenta")).toBeVisible();

    // Fill form
    await page.locator("#reg-username").fill(TEST_USER.username);
    await page.locator("#reg-email").fill(TEST_USER.email);
    await page.locator("#reg-password").fill(TEST_USER.password);
    await page.getByRole("button", { name: "Crear cuenta" }).click();

    // Should redirect to dashboard (vehicle identification wizard first)
    await expect(page).toHaveURL("/");
    await expect(page.getByText("Identificación del vehículo")).toBeVisible();
  });

  test("should login with valid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.getByPlaceholder("tu@email.com").fill(TEST_USER.email);
    await page.getByPlaceholder("••••••••").fill(TEST_USER.password);
    await page.locator('button[type="submit"]').click();

    // Should redirect to dashboard (vehicle identification wizard first)
    await expect(page).toHaveURL("/");
    await expect(page.getByText("Identificación del vehículo")).toBeVisible();
  });

  test("should show error with invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.getByPlaceholder("tu@email.com").fill("no@existe.com");
    await page.getByPlaceholder("••••••••").fill("wrongpassword");
    await page.locator('button[type="submit"]').click();

    // Should show error and stay on login page
    await expect(page.locator(".text-destructive").first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page).toHaveURL("/login");
  });

  test("should reject registration with a password missing complexity requirements", async ({
    page,
  }) => {
    await page.goto("/login");

    await page.getByRole("tab", { name: "Registrarse" }).click();
    await expect(page.getByText("Crear cuenta")).toBeVisible();

    await page.locator("#reg-username").fill(`${TEST_USER.username}_weak`);
    await page.locator("#reg-email").fill(`weak_${TEST_USER.email}`);
    await page.locator("#reg-password").fill("password123");
    await page.getByRole("button", { name: "Crear cuenta" }).click();

    await expect(
      page.getByText(
        "Debe incluir 1 mayúscula, 1 número y 1 carácter especial",
      ),
    ).toBeVisible();
    await expect(page).toHaveURL("/login");
  });

  test("should toggle password visibility with the eye button", async ({
    page,
  }) => {
    await page.goto("/login");

    const loginPassword = page.locator("#login-password");
    await loginPassword.fill("some-password");
    await expect(loginPassword).toHaveAttribute("type", "password");

    await page.getByRole("button", { name: "Mostrar contraseña" }).click();
    await expect(loginPassword).toHaveAttribute("type", "text");

    await page.getByRole("button", { name: "Ocultar contraseña" }).click();
    await expect(loginPassword).toHaveAttribute("type", "password");
  });
});
