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
  name: string,
  code: string,
  errors: string[],
) {
  const page = await context.newPage();
  monitor(page, errors);
  await page.goto("/#/join");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Group code").fill(code);
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

async function completeQuest(page: Page) {
  for (let itemNumber = 0; itemNumber < 48; itemNumber += 1) {
    const reflection = page.getByRole("heading", {
      name: "Carry one idea forward",
    });
    const confirmResponse = page.getByRole("button", { name: "Confirm response" });
    await Promise.race([
      reflection.waitFor({ state: "visible", timeout: 10_000 }),
      confirmResponse.waitFor({ state: "visible", timeout: 10_000 }),
    ]);
    if (await reflection.isVisible()) break;
    await answerCurrentItem(page);
  }
  await expect(
    page.getByRole("heading", { name: "Carry one idea forward" }),
  ).toBeVisible();
  await page.locator('input[type="radio"]').first().check();
  await page.locator("textarea").fill("I will apply this idea in our next class task.");
  await page.getByRole("button", { name: "Finish reflection" }).click();
  await expect(page.getByRole("heading", { name: /growth route/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Campus team board" })).toBeVisible();
}

test("runs one teacher and three isolated students through a real local classroom", async ({
  browser,
}) => {
  expect(teacherEmail).not.toBe("");
  expect(teacherPassword).not.toBe("");
  const errors: string[] = [];
  const teacherContext = await browser.newContext();
  const teacherPage = await teacherContext.newPage();
  monitor(teacherPage, errors);
  const studentContexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  const invalidContext = await browser.newContext();

  try {
    await teacherPage.goto("/#/teacher/sign-in");
    await teacherPage.getByLabel("Email address").fill(teacherEmail);
    await teacherPage.getByLabel("Password").fill(teacherPassword);
    await teacherPage.getByRole("button", { name: "Sign in securely" }).click();
    await expect(
      teacherPage.getByRole("heading", { name: "Prepare the class quest" }),
    ).toBeVisible();
    await teacherPage.getByRole("link", {
      name: "Open Student-ready local classroom dashboard",
    }).click();
    await expect(
      teacherPage.getByRole("heading", { name: "Class learning dashboard" }),
    ).toBeVisible();

    const readiness = teacherPage.getByRole("region", {
      name: "Classroom readiness",
    });
    if (await readiness.getByText("closed", { exact: true }).isVisible()) {
      await teacherPage.getByRole("button", { name: "Open joining" }).click();
      await teacherPage.getByRole("button", {
        name: "Confirm open class joining for Current cohort",
        exact: true,
      }).click();
    }
    await expect(readiness.getByText("open", { exact: true })).toBeVisible();
    const rows = await readiness.locator("tbody tr").allTextContents();
    const codes = new Map<number, string>();
    for (const row of rows) {
      const match = row.match(/Group\s*(\d+)\s*([2-9A-HJ-NP-Z]{8})/);
      if (match?.[1] && match[2]) codes.set(Number(match[1]), match[2]);
    }
    expect(codes.size).toBe(3);

    const invalidPage = await invalidContext.newPage();
    monitor(invalidPage, errors);
    await invalidPage.goto("/#/join");
    await invalidPage.getByLabel("Your name").fill("Invalid Test Learner");
    await invalidPage.getByLabel("Group code").fill("ZZZZZZZZ");
    await invalidPage.getByRole("button", { name: "Join Group" }).click();
    await expect(invalidPage.getByRole("alert")).toContainText(
      "group code was not recognized",
    );

    const studentPages = await Promise.all([
      joinStudent(studentContexts[0], "Alex Chen", codes.get(1)!, errors),
      joinStudent(studentContexts[1], "Alex Chen", codes.get(2)!, errors),
      joinStudent(studentContexts[2], "Jordan Lee", codes.get(1)!, errors),
    ]);
    await studentPages[0].reload();
    await expect(
      studentPages[0].getByText("Waiting for your teacher to open the quest"),
    ).toBeVisible();

    await teacherPage.reload();
    await expect(readiness.getByText("3 of 12 students joined.")).toBeVisible();
    const jordanRow = readiness.getByRole("row").filter({ hasText: "Jordan Lee" });
    await jordanRow.getByLabel("Move Jordan Lee to").selectOption({ label: "Group 3" });
    await jordanRow.getByRole("button", { name: "Move Jordan Lee", exact: true }).click();
    await teacherPage.getByRole("button", {
      name: "Confirm move student",
      exact: true,
    }).click();
    await expect(readiness.getByRole("row").filter({ hasText: "Jordan Lee" }))
      .toContainText("Group 3");
    await studentPages[2].reload();
    await expect(studentPages[2].getByRole("heading", { name: "Group 3" }))
      .toBeVisible();

    await teacherPage.getByRole("button", { name: "Launch quest" }).click();
    await teacherPage.getByRole("button", {
      name: "Confirm launch quest for Current cohort",
      exact: true,
    }).click();
    for (const page of studentPages) {
      await expect(page.getByRole("heading", { name: "Diagnostic Gate" }))
        .toBeVisible({ timeout: 15_000 });
    }

    await teacherPage.reload();
    const refreshedReadiness = teacherPage.getByRole("region", {
      name: "Classroom readiness",
    });
    const refreshedJordan = refreshedReadiness.getByRole("row")
      .filter({ hasText: "Jordan Lee" });
    await refreshedJordan.getByRole("button", { name: "Reset Jordan Lee", exact: true }).click();
    await teacherPage.getByRole("button", {
      name: "Confirm reset student activity",
      exact: true,
    }).click();
    await studentPages[2].reload();
    await expect(studentPages[2].getByRole("heading", { name: "Diagnostic Gate" }))
      .toBeVisible({ timeout: 10_000 });

    await completeQuest(studentPages[0]);
    await studentPages[0].reload();
    await expect(studentPages[0].getByRole("heading", { name: /growth route/i }))
      .toBeVisible();

    await studentPages[1].goto(
      teacherPage.url(),
    );
    await expect(studentPages[1].getByRole("heading", { name: "Teacher sign in" }))
      .toBeVisible();

    await teacherPage.reload();
    await expect(
      teacherPage.getByRole("region", { name: "Class progress" })
        .getByText("1", { exact: true }),
    ).toHaveCount(1);
    const finalReadiness = teacherPage.getByRole("region", {
      name: "Classroom readiness",
    });
    const finalJordan = finalReadiness.getByRole("row")
      .filter({ hasText: "Jordan Lee" });
    await finalJordan.getByRole("button", { name: "Issue recovery for Jordan Lee", exact: true })
      .click();
    await teacherPage.getByRole("button", {
      name: "Confirm issue recovery",
      exact: true,
    }).click();
    await expect(teacherPage.getByRole("link", { name: "Student recovery link" }))
      .toBeVisible();

    await finalJordan.getByRole("button", { name: "Remove Jordan Lee", exact: true }).click();
    await teacherPage.getByRole("button", {
      name: "Confirm remove student",
      exact: true,
    }).click();
    await studentPages[2].reload();
    await expect(studentPages[2].getByRole("heading", {
      name: "Future-Ready Campus Quest",
    })).toBeVisible();
    await expect(studentPages[2].getByRole("heading", { name: "Diagnostic Gate" }))
      .toHaveCount(0);

    await teacherPage.getByRole("button", { name: "Close joining" }).click();
    await teacherPage.getByRole("button", {
      name: "Confirm close class joining for Current cohort",
      exact: true,
    }).click();
    await expect(
      teacherPage.getByRole("region", { name: "Classroom readiness" })
        .getByText("closed", { exact: true }),
    ).toBeVisible();

    expect(errors).toEqual([]);
  } finally {
    await invalidContext.close();
    await Promise.all(studentContexts.map((context) => context.close()));
    await teacherContext.close();
  }
});
