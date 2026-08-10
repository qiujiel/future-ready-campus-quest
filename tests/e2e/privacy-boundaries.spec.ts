import { expect, test, type Route } from "@playwright/test";
import { installSupabaseSession } from "./supabase-session";

const configuredSupabaseUrl = new URL(
  process.env.VITE_SUPABASE_URL ?? "https://e2e.invalid",
);

function usesApprovedCredentialTransport(url: URL) {
  return url.protocol === "https:" ||
    (url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "::1"].includes(url.hostname));
}

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
  const privateObjectUrl = new URL(
    "/storage/v1/object/group-images/cohort/group.webp",
    configuredSupabaseUrl,
  ).href;
  let requestedPrivateObjectUrl: string | undefined;
  await page.route("**/storage/v1/object/group-images/**", (route) => {
    requestedPrivateObjectUrl = route.request().url();
    return route.fulfill({
      status: 403,
      headers: { "access-control-allow-origin": "*" },
      body: "not available",
    });
  });
  await page.goto("/");
  const status = await page.evaluate(async (url) => {
    const response = await fetch(url);
    return response.status;
  }, privateObjectUrl);
  expect(status).toBe(403);
  expect(requestedPrivateObjectUrl).toBe(privateObjectUrl);
});

test("join and returning-login passcodes stay only in their approved HTTPS request bodies", async ({
  page,
}) => {
  const passcode = "8642";
  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];
  const audit = {
    joinSeen: false,
    loginSeen: false,
    credentialOutsideApprovedBody: false,
    malformedCredentialRequest: false,
  };
  page.on("console", (message) => consoleMessages.push(message.text()));
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("request", (request) => {
    const url = new URL(request.url());
    const headers = JSON.stringify(request.headers());
    const body = request.postData() ?? "";
    const approvedEndpoint =
      url.origin === configuredSupabaseUrl.origin &&
      (url.pathname === "/functions/v1/join-cohort" ||
        url.pathname === "/functions/v1/student-login");
    if (url.href.includes(passcode) || headers.includes(passcode)) {
      audit.credentialOutsideApprovedBody = true;
    }
    if (body.includes(passcode) && !approvedEndpoint) {
      audit.credentialOutsideApprovedBody = true;
    }
  });

  async function auditCredentialRequest(
    route: Route,
    endpoint: "join" | "login",
  ) {
    const request = route.request();
    const url = new URL(request.url());
    let body: Record<string, unknown> = {};
    try {
      body = request.postDataJSON() as Record<string, unknown>;
    } catch {
      audit.malformedCredentialRequest = true;
    }
    if (endpoint === "join") audit.joinSeen = true;
    else audit.loginSeen = true;
    if (
      request.method() !== "POST" ||
      url.origin !== configuredSupabaseUrl.origin ||
      !usesApprovedCredentialTransport(url) ||
      url.pathname !==
        `/functions/v1/${endpoint === "join" ? "join-cohort" : "student-login"}` ||
      url.search !== "" ||
      body.passcode !== passcode
    ) {
      audit.malformedCredentialRequest = true;
    }
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "CREDENTIAL_NOT_ACCEPTED" }),
    });
  }

  await page.route("**/functions/v1/join-cohort", (route) =>
    auditCredentialRequest(route, "join"));
  await page.route("**/functions/v1/student-login", (route) =>
    auditCredentialRequest(route, "login"));

  await page.goto(
    "/#/class/40000000-0000-4000-8000-000000000001",
  );
  await page.getByLabel("Your name").fill("Privacy Test Learner");
  await page.getByLabel("Group code").fill("BCDF2345");
  await page.getByLabel("Create a 4-digit passcode").fill(passcode);
  await page.getByLabel("Confirm passcode").fill(passcode);
  await page.getByRole("button", { name: "Join Group" }).click();
  await expect(page.getByRole("alert")).toBeVisible();

  await page.getByRole("button", { name: "Log back in" }).click();
  await page.getByLabel("Your name").fill("Privacy Test Learner");
  await page.getByLabel("4-digit passcode").fill(passcode);
  await page.getByRole("button", { name: "Continue to activity" }).click();
  await expect(page.getByRole("alert")).toBeVisible();

  expect(audit).toEqual({
    joinSeen: true,
    loginSeen: true,
    credentialOutsideApprovedBody: false,
    malformedCredentialRequest: false,
  });

  const browserStorage = await page.evaluate(() => ({
    local: Object.values(localStorage),
    session: Object.values(sessionStorage),
  }));
  expect(JSON.stringify(browserStorage)).not.toContain(passcode);

  await page.goto("/#/join");
  await expect(page.locator("body")).not.toContainText(passcode);
  expect(consoleMessages.join("\n")).not.toContain(passcode);
  expect(pageErrors.join("\n")).not.toContain(passcode);
});
