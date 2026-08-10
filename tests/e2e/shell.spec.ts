import { expect, test } from "@playwright/test";

test("landing page works at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /future-ready campus quest/i }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});

test("student join route without a class link gives safe teacher guidance", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/#/join");

  await expect(
    page.getByRole("heading", { name: /open your class link/i }),
  ).toBeVisible();
  await expect(page.getByText(/same class link works for every group/i))
    .toBeVisible();
  await expect(page.locator("input")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
