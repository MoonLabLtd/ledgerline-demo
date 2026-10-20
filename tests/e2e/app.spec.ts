import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const heading = (page: Page) => page.getByRole("banner").getByRole("heading", { level: 1 });

test("T-E-01 first run shows an empty, working dashboard", async ({ page }) => {
  await page.goto("/");
  await expect(heading(page)).toHaveText("Overview");
  await expect(page.getByText("No sales in this period").first()).toBeVisible();
});

test("T-E-02 sidebar navigates between every section", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main navigation" }).or(page.locator('[data-sidebar="sidebar"]')).first();
  for (const name of ["Sales", "Products", "Customers", "Analytics", "Settings", "Overview"]) {
    await nav.getByRole("link", { name, exact: true }).click();
    await expect(heading(page)).toHaveText(name);
  }
});

test("T-E-03 validation blocks an incomplete sale", async ({ page }) => {
  await page.goto("/sales");
  await page.getByRole("button", { name: "Add sale" }).first().click();
  const form = page.getByRole("form", { name: "Add sale" });
  await form.getByRole("button", { name: "Record sale" }).click();
  await expect(form.getByRole("alert").first()).toBeVisible();
  await expect(form).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("No sales yet")).toBeVisible();
});

test("T-E-04 a recorded sale shows up everywhere and survives a reload", async ({ page }) => {
  await page.goto("/sales");
  await page.getByRole("button", { name: "Add sale" }).first().click();
  const form = page.getByRole("form", { name: "Add sale" });
  await form.getByRole("radio", { name: "New product" }).click();
  await form.getByLabel("Product name", { exact: true }).fill("E2E Widget");
  await form.getByLabel("Category", { exact: true }).fill("Testing");
  await form.getByLabel("Qty", { exact: true }).fill("3");
  await form.getByLabel("Unit price", { exact: true }).fill("12.50");
  await form.getByRole("button", { name: "Record sale" }).click();

  await expect(page.getByText("Sale recorded").first()).toBeVisible();
  await expect(form).toBeHidden();
  const row = page.getByRole("row").filter({ hasText: "E2E Widget" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("$37.50");

  await page.reload();
  await expect(page.getByRole("row").filter({ hasText: "E2E Widget" })).toBeVisible();

  await page.goto("/");
  await expect(page.getByText("$37.50").first()).toBeVisible();

  await page.goto("/products");
  await expect(page.getByRole("row").filter({ hasText: "E2E Widget" })).toBeVisible();
});

test("T-E-05 mobile layout uses a navigation drawer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Products", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("link", { name: "Products", exact: true }).click();
  await expect(heading(page)).toHaveText("Products");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
