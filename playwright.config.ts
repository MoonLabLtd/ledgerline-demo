import { defineConfig, devices } from "@playwright/test";

const PORT = 3200;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  expect: { timeout: 20_000 },
  timeout: 60_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node -e "require('fs').rmSync('.tmp/e2e', { recursive: true, force: true })" && next dev -p ${PORT}`,
    url: `${baseURL}/api/settings`,
    env: { SALES_DB_PATH: ".tmp/e2e/sales.db", NEXT_TELEMETRY_DISABLED: "1" },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
