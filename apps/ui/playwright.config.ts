import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: 0,
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "cd ../core-api && pnpm dev",
      port: 4000,
      timeout: 15_000,
      reuseExistingServer: true,
    },
    {
      command: "pnpm dev",
      port: 5173,
      timeout: 15_000,
      reuseExistingServer: true,
    },
  ],
});
