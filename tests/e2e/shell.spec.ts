import { expect, test } from "@playwright/test";

test("landing page works at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /future-ready campus quest/i }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});

test("student join route requests no email, password, or PIN", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/#/join");

  await expect(
    page.getByRole("heading", { name: /join your group/i }),
  ).toBeVisible();
  await expect(page.getByLabel(/^your name/i)).toBeVisible();
  await expect(page.getByLabel(/^group code/i)).toBeVisible();
  await expect(page.getByLabel(/email|password|pin/i)).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
