import { expect, test } from "@playwright/test";

test("landing page works at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /future-ready campus quest/i }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
