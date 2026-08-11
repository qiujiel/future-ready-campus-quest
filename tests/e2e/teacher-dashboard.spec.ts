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
  await page.route("**/rest/v1/rpc/current_role", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify("teacher"),
    }));
  await page.route("**/functions/v1/teacher-dashboard", async (route) => {
    const request = route.request().postDataJSON() as {
      view?: string;
    } | null;
    const response = request?.view === "readiness"
      ? {
          readiness: {
            cohortId,
            title: "Digital Futures · Class 1",
            expected: 30,
            joined: 30,
            active: 10,
            started: 10,
            submitted: 20,
            incomplete: 10,
            errors: 0,
            joining: {
              open: true,
              expiresAt: "2030-01-01T10:00:00.000Z",
              studentUrl: "https://example.test/#/join/class-1",
            },
            groups: [],
          },
        }
      : {
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
            classFocus: {
              conceptId: "C1",
              missedStudents: 6,
              studentCount: 30,
              missedQuestions: [
                { itemId: "C1-Q3", incorrectResponses: 8, responses: 30 },
              ],
            },
            mostMissed: [],
            teamScores: [
              {
                groupId: "group-1",
                groupNumber: 1,
                displayName: "Future Makers",
                score: 86,
                completedMembers: 4,
                enrolledMembers: 4,
                conceptFocus: {
                  conceptId: "C1",
                  missedStudents: 2,
                  studentCount: 4,
                  missedQuestions: [
                    { itemId: "C1-Q3", incorrectResponses: 3, responses: 4 },
                  ],
                },
              },
            ],
            generatedAt: "2030-01-01T09:00:00.000Z",
          },
        };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
});

test("teacher can read accessible team results and most-missed evidence", async ({
  page,
}) => {
  await page.goto(`/#/teacher/cohorts/${cohortId}`);
  await expect(page.getByRole("heading", { name: "Team results" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /most-missed concept/i })).toBeVisible();
  await expect(page.getByText("6 of 30 students missed this concept.")).toBeVisible();
  await expect(page.getByRole("table", {
    name: "Team scores and most-missed concepts",
  })).toBeVisible();
  await expect(page.getByRole("row", { name: /Group 1 · Future Makers/i }))
    .toContainText(/86.*C1.*2 of 4/i);
});
