import { expect, test } from "@playwright/test";
import { installSupabaseSession } from "./supabase-session";

const cohortId = "d3000000-0000-4000-8000-000000000001";

test.beforeEach(async ({ page }) => {
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
  await page.route("**/functions/v1/teacher-dashboard", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        summary: {
          cohortId,
          enrolled: 30,
          active: 10,
          completed: 20,
          conceptAggregates: Array.from({ length: 8 }, (_, index) => ({
            conceptId: `C${index + 1}`,
            first: { needs_support: 4, developing: 6, secure: 20 },
            final: { needs_support: 1, developing: 3, secure: 26 },
            retryCorrect: index === 0 ? 3 : 0,
            retryAttempted: index === 0 ? 4 : 0,
          })),
          mostMissed: [],
          teamScores: [],
          generatedAt: "2030-01-01T09:00:00.000Z",
        },
      }),
    }));
});

test("teacher can read the accessible C1-C8 evidence table", async ({
  page,
}) => {
  await page.goto(`/#/teacher/cohorts/${cohortId}`);
  await expect(
    page.getByRole("heading", { name: /class learning dashboard/i }),
  ).toBeVisible();
  await expect(page.getByRole("row", { name: /C1/i })).toContainText(
    /first|final|retry/i,
  );
  await expect(page.getByRole("row", { name: /C8/i })).toBeVisible();
  await expect(page.getByText(/retry is formative/i)).toBeVisible();
});
