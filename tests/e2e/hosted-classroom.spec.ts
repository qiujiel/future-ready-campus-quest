import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const enabled = process.env.LOCAL_CLASSROOM_E2E === "1";
const teacherEmail = process.env.LOCAL_TEACHER_EMAIL ?? "";
const teacherPassword = process.env.LOCAL_TEACHER_PASSWORD ?? "";

test.skip(!enabled, "requires the explicit local full-stack classroom fixture");

function monitor(page: Page, errors: string[]) {
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 500) {
      errors.push(`network: ${response.status()} ${new URL(response.url()).pathname}`);
    }
  });
}

async function joinStudent(
  context: BrowserContext,
  classUrl: string,
  name: string,
  code: string,
  passcode: string,
  wantsLeader: boolean,
  errors: string[],
) {
  const page = await context.newPage();
  monitor(page, errors);
  await page.goto(classUrl);
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Group code").fill(code);
  await page.getByLabel("Create a 4-digit passcode").fill(passcode);
  await page.getByLabel("Confirm passcode").fill(passcode);
  await page.getByLabel(
    wantsLeader
      ? "Yes, I am the group leader"
      : "No, I am not the group leader",
  ).check();
  await page.getByRole("button", { name: "Join Group" }).click();
  await expect(page).toHaveURL(/#\/quest$/);
  await expect(
    page.getByRole("heading", { name: /Waiting for your teacher to open the quest/i }),
  ).toBeVisible();
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  return page;
}

async function answerCurrentItem(page: Page) {
  const radios = page.locator('input[type="radio"]');
  const checkboxes = page.locator('input[type="checkbox"]');
  const selects = page.locator("select");
  if (await radios.count()) {
    await radios.first().check();
  } else if (await checkboxes.count()) {
    await checkboxes.first().check();
  } else if (await selects.count()) {
    for (const select of await selects.all()) {
      await select.selectOption({ index: 1 });
    }
  }
  await page.getByRole("button", { name: "Confirm response" }).click();
  await expect(
    page.getByRole("button", { name: "Continue campus route" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue campus route" }).click();
}

test("runs a clean teacher and two isolated students through recoverable class entry", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  expect(teacherEmail).not.toBe("");
  expect(teacherPassword).not.toBe("");
  const errors: string[] = [];
  const teacherContext = await browser.newContext();
  const teacherPage = await teacherContext.newPage();
  monitor(teacherPage, errors);
  const studentContexts = await Promise.all([browser.newContext(), browser.newContext()]);
  const invalidContext = await browser.newContext();
  let returningContext: BrowserContext | null = null;

  try {
    await teacherPage.goto("/#/teacher/sign-in");
    await teacherPage.getByLabel("Email address").fill(teacherEmail);
    await teacherPage.getByLabel("Password").fill(teacherPassword);
    await teacherPage.getByRole("button", { name: "Sign in securely" }).click();
    await expect(
      teacherPage.getByRole("heading", { name: "Create your class" }),
    ).toBeVisible();
    const className = `Synthetic classroom ${Date.now()}`;
    await teacherPage.getByLabel("Class name").fill(className);
    await teacherPage.getByLabel("Number of groups").fill("2");
    await teacherPage.getByRole("button", {
      name: "Create class and open joining",
    }).click();
    await expect(
      teacherPage.getByRole("heading", { name: "Class learning dashboard" }),
    ).toBeVisible();

    const readiness = teacherPage.getByRole("region", {
      name: "Classroom readiness",
    });
    await expect(readiness.getByText("open", { exact: true })).toBeVisible();
    const classLink = readiness.getByRole("link", {
      name: "Student application",
    });
    const classUrl = await classLink.getAttribute("href");
    expect(classUrl).toMatch(/#\/class\/[0-9a-f-]{36}$/i);
    const rows = await readiness.locator("tbody tr").allTextContents();
    const codes = new Map<number, string>();
    for (const row of rows) {
      const match = row.match(/Group\s*(\d+)\s*([2-9A-HJ-NP-Z]{8})/);
      if (match?.[1] && match[2]) codes.set(Number(match[1]), match[2]);
    }
    expect(codes.size).toBe(2);
    expect(new Set(codes.values()).size).toBe(2);

    const invalidPage = await invalidContext.newPage();
    monitor(invalidPage, errors);
    await invalidPage.goto(classUrl!);
    await invalidPage.getByLabel("Your name").fill("Invalid Test Learner");
    await invalidPage.getByLabel("Group code").fill("ZZZZZZZZ");
    await invalidPage.getByLabel("Create a 4-digit passcode").fill("9810");
    await invalidPage.getByLabel("Confirm passcode").fill("9810");
    await invalidPage.getByRole("button", { name: "Join Group" }).click();
    await expect(invalidPage.getByRole("alert")).toContainText(
      "group code was not recognized",
    );

    const studentPages = await Promise.all([
      joinStudent(
        studentContexts[0],
        classUrl!,
        "Synthetic Leader",
        codes.get(1)!,
        "4826",
        true,
        errors,
      ),
      joinStudent(
        studentContexts[1],
        classUrl!,
        "Synthetic Member",
        codes.get(1)!,
        "5937",
        false,
        errors,
      ),
    ]);
    await expect(studentPages[0].getByText(/you are the group leader/i)).toBeVisible();
    await expect(studentPages[0].getByLabel("Group name")).toBeVisible();
    await expect(studentPages[1].getByText(/group leader is shaping this space/i))
      .toBeVisible();
    await expect(studentPages[1].getByLabel("Group name")).toHaveCount(0);
    await studentContexts[1].close();

    await teacherPage.reload();
    const leaderRow = readiness.getByRole("row").filter({
      hasText: "Synthetic Leader",
    });
    await expect(leaderRow).toContainText("Group leader");
    await expect(readiness.getByRole("row").filter({ hasText: "Synthetic Member" }))
      .not.toContainText("Group leader");

    await teacherPage.getByRole("button", { name: "Launch quest" }).click();
    await teacherPage.getByRole("button", {
      name: "Confirm launch quest for Current cohort",
      exact: true,
    }).click();
    await expect(studentPages[0].getByRole("heading", { name: "Diagnostic Gate" }))
      .toBeVisible({ timeout: 15_000 });
    await answerCurrentItem(studentPages[0]);

    await teacherPage.getByRole("button", { name: "Close joining" }).click();
    await teacherPage.getByRole("button", {
      name: "Confirm close class joining for Current cohort",
      exact: true,
    }).click();
    await expect(
      teacherPage.getByRole("region", { name: "Classroom readiness" })
        .getByText("closed", { exact: true }),
    ).toBeVisible();

    await studentContexts[0].close();
    returningContext = await browser.newContext();
    const returningPage = await returningContext.newPage();
    monitor(returningPage, errors);
    await returningPage.goto(classUrl!);
    await returningPage.getByRole("button", { name: "Log back in" }).click();
    await returningPage.getByLabel("Your name").fill("Synthetic Leader");
    await returningPage.getByLabel("4-digit passcode").fill("4826");
    await returningPage.getByRole("button", { name: "Continue to activity" }).click();
    await expect(returningPage).toHaveURL(/#\/quest$/);
    await expect(returningPage.getByText(/restored your place/i)).toBeVisible();
    await expect(returningPage.getByRole("heading", { name: "Diagnostic Gate" }))
      .toBeVisible();

    await returningPage.goto(teacherPage.url());
    await expect(returningPage.getByRole("heading", { name: "Teacher sign in" }))
      .toBeVisible();

    const apiUrl = process.env.TEST_SUPABASE_URL ?? "";
    const publishableKey = process.env.TEST_SUPABASE_ANON_KEY ?? "";
    if (apiUrl && publishableKey) {
      const denial = await returningPage.evaluate(async ({ apiUrl, publishableKey }) => {
        const session = Object.values(localStorage)
          .map((value) => {
            try {
              return JSON.parse(value);
            } catch {
              return null;
            }
          })
          .find((value) => typeof value?.access_token === "string");
        const response = await fetch(`${apiUrl}/functions/v1/teacher-dashboard`, {
          method: "POST",
          headers: {
            apikey: publishableKey,
            Authorization: `Bearer ${session?.access_token ?? ""}`,
            Origin: window.location.origin,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ cohortId: crypto.randomUUID() }),
        });
        return response.status;
      }, { apiUrl, publishableKey });
      expect([401, 403, 404]).toContain(denial);
    }

    await teacherPage.reload();
    await expect(
      teacherPage.getByRole("region", { name: "Classroom readiness" })
        .getByRole("row").filter({ hasText: "Synthetic Leader" }),
    ).toContainText("Incomplete");

    expect(errors).toEqual([]);
  } finally {
    await Promise.allSettled([
      ...(returningContext ? [returningContext.close()] : []),
      invalidContext.close(),
      ...studentContexts.map((context) => context.close()),
      teacherContext.close(),
    ]);
  }
});
