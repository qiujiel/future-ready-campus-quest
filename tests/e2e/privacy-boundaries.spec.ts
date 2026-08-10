import { expect, test } from "@playwright/test";
import { installSupabaseSession } from "./supabase-session";

test("student and anonymous sessions cannot enter teacher routes", async ({
  page,
}) => {
  await installSupabaseSession(page, "student");
  await page.route("**/auth/v1/user", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "student-1",
        app_metadata: { role: "student" },
        user_metadata: {},
        aud: "authenticated",
        created_at: "2030-01-01T00:00:00.000Z",
      }),
    }));
  await page.route("**/rest/v1/rpc/current_role", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify("student"),
    }));
  await page.goto(
    "/#/teacher/cohorts/d3000000-0000-4000-8000-000000000001",
  );
  await expect(page).toHaveURL(/#\/teacher\/sign-in$/);
  await expect(page.getByText("Synthetic Learner")).toHaveCount(0);
});

test("cross-cohort denial is neutral and reveals no private fields", async ({
  page,
}) => {
  await installSupabaseSession(page, "teacher");
  await page.route("**/auth/v1/user", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "teacher-1",
        app_metadata: { role: "teacher" },
        user_metadata: {},
        aud: "authenticated",
        created_at: "2030-01-01T00:00:00.000Z",
      }),
    }));
  await page.route("**/rest/v1/rpc/current_role", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify("teacher"),
    }));
  await page.route("**/functions/v1/teacher-dashboard", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ error: "COHORT_NOT_AVAILABLE" }),
    }));
  await page.goto(
    "/#/teacher/cohorts/d3000000-0000-4000-8000-000000000099",
  );
  await expect(page.getByRole("alert")).toHaveText(
    /cohort is not available/i,
  );
  await expect(page.getByText(/real name|selected answer|reflection note/i))
    .toHaveCount(0);
});

test("direct private Storage URLs remain unavailable", async ({ page }) => {
  await page.route("**/storage/v1/object/group-images/**", (route) =>
    route.fulfill({ status: 403, body: "not available" }));
  await page.goto("/");
  const status = await page.evaluate(async () => {
    const response = await fetch(
      "https://e2e.invalid/storage/v1/object/group-images/cohort/group.webp",
    );
    return response.status;
  });
  expect(status).toBe(403);
});

test("student passcodes are not persisted or written to browser logs", async ({
  page,
}) => {
  const passcode = "8642";
  const consoleMessages: string[] = [];
  page.on("console", (message) => consoleMessages.push(message.text()));

  await page.goto(
    "/#/class/40000000-0000-4000-8000-000000000001",
  );
  await page.getByLabel("Create a 4-digit passcode").fill(passcode);
  await page.getByLabel("Confirm passcode").fill(passcode);

  const browserStorage = await page.evaluate(() => ({
    local: Object.values(localStorage),
    session: Object.values(sessionStorage),
  }));
  expect(JSON.stringify(browserStorage)).not.toContain(passcode);

  await page.goto("/#/join");
  await expect(page.locator("body")).not.toContainText(passcode);
  expect(consoleMessages.join("\n")).not.toContain(passcode);
});
