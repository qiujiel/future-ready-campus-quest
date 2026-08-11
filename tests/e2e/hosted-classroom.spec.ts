import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const enabled = process.env.LOCAL_CLASSROOM_E2E === "1";
const teacherEmail = process.env.LOCAL_TEACHER_EMAIL ?? "";
const teacherPassword = process.env.LOCAL_TEACHER_PASSWORD ?? "";
const apiUrl = process.env.TEST_SUPABASE_URL ?? "";
const publishableKey = process.env.TEST_SUPABASE_ANON_KEY ?? "";

type StudentState = {
  studentId: string;
  cohortId: string;
  groupId: string;
  attemptId: string | null;
  lastAcceptedSequence: number | null;
  acceptedSequences: number[];
};

test.skip(!enabled, "requires the explicit local full-stack classroom fixture");

function monitor(page: Page, errors: string[]) {
  page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 500) {
      errors.push(`network: ${response.status()} ${new URL(response.url()).pathname}`);
    }
  });
}

async function openClassroomSetup(page: Page) {
  const groupTable = page.getByRole("table", {
    name: "Group codes and students",
  });
  if (!(await groupTable.isVisible())) {
    await page.getByText("Classroom setup and group codes", {
      exact: true,
    }).click();
  }
  await expect(groupTable).toBeVisible();
  return groupTable;
}

async function openStudentRoster(page: Page) {
  await openClassroomSetup(page);
  const readiness = page.getByRole("region", {
    name: "Classroom readiness",
  });
  if (!(await readiness.isVisible())) {
    await page.getByText("Student roster and controls", {
      exact: true,
    }).click();
  }
  await expect(readiness).toBeVisible();
  return readiness;
}

async function openSessionControls(page: Page) {
  await openClassroomSetup(page);
  const controls = page.getByRole("region", { name: "Session controls" });
  if (!(await controls.isVisible())) {
    await page.getByText("Live session controls", { exact: true }).click();
  }
  await expect(controls).toBeVisible();
  return controls;
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

async function readStudentState(
  page: Page,
  apiUrl: string,
  publishableKey: string,
): Promise<StudentState> {
  return page.evaluate(async ({ apiUrl, publishableKey }) => {
    const session = Object.values(localStorage)
      .map((value) => {
        try {
          return JSON.parse(value) as { access_token?: unknown };
        } catch {
          return null;
        }
      })
      .find((value) => typeof value?.access_token === "string");
    const accessToken = session?.access_token;
    if (typeof accessToken !== "string") {
      throw new Error("STUDENT_SESSION_NOT_AVAILABLE");
    }
    const headers = {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
    };
    const [profileResponse, attemptsResponse] = await Promise.all([
      fetch(
        `${apiUrl}/rest/v1/student_private_profiles?select=student_id,cohort_id,group_id&limit=2`,
        { headers },
      ),
      fetch(
        `${apiUrl}/rest/v1/quest_attempts?select=id,last_accepted_sequence&order=started_at.desc&limit=2`,
        { headers },
      ),
    ]);
    if (!profileResponse.ok || !attemptsResponse.ok) {
      throw new Error("STUDENT_STATE_NOT_AVAILABLE");
    }
    const profiles = await profileResponse.json() as Array<Record<string, unknown>>;
    const attempts = await attemptsResponse.json() as Array<Record<string, unknown>>;
    const profile = profiles[0];
    const attempt = attempts[0];
    if (
      profiles.length !== 1 ||
      typeof profile?.student_id !== "string" ||
      typeof profile.cohort_id !== "string" ||
      typeof profile.group_id !== "string"
    ) {
      throw new Error("STUDENT_STATE_NOT_AVAILABLE");
    }
    if (
      attempt &&
      (typeof attempt.id !== "string" ||
        !Number.isInteger(attempt.last_accepted_sequence))
    ) {
      throw new Error("STUDENT_STATE_NOT_AVAILABLE");
    }
    const acceptedResponse = attempt
      ? await fetch(
        `${apiUrl}/rest/v1/student_responses?attempt_id=eq.${encodeURIComponent(attempt.id as string)}&select=client_sequence&order=client_sequence`,
        { headers },
      )
      : null;
    if (acceptedResponse && !acceptedResponse.ok) {
      throw new Error("STUDENT_STATE_NOT_AVAILABLE");
    }
    const acceptedResponses = acceptedResponse
      ? await acceptedResponse.json() as Array<Record<string, unknown>>
      : [];
    const acceptedSequences = acceptedResponses.map((response) => {
      if (!Number.isInteger(response.client_sequence)) {
        throw new Error("STUDENT_STATE_NOT_AVAILABLE");
      }
      return response.client_sequence as number;
    });
    return {
      studentId: profile.student_id,
      cohortId: profile.cohort_id,
      groupId: profile.group_id,
      attemptId: typeof attempt?.id === "string" ? attempt.id : null,
      lastAcceptedSequence:
        typeof attempt?.last_accepted_sequence === "number"
          ? attempt.last_accepted_sequence
          : null,
      acceptedSequences,
    };
  }, { apiUrl, publishableKey });
}

async function probeTeacherDashboard(
  page: Page,
  apiUrl: string,
  publishableKey: string,
  cohortId: string,
) {
  return page.evaluate(async ({ apiUrl, publishableKey, cohortId }) => {
    const session = Object.values(localStorage)
      .map((value) => {
        try {
          return JSON.parse(value) as { access_token?: unknown };
        } catch {
          return null;
        }
      })
      .find((value) => typeof value?.access_token === "string");
    if (typeof session?.access_token !== "string") {
      throw new Error("STUDENT_SESSION_NOT_AVAILABLE");
    }
    const response = await fetch(`${apiUrl}/functions/v1/teacher-dashboard`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${session.access_token}`,
        Origin: window.location.origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cohortId }),
    });
    const payload = await response.json().catch(() => null) as {
      error?: unknown;
    } | null;
    return {
      status: response.status,
      error: typeof payload?.error === "string" ? payload.error : null,
    };
  }, { apiUrl, publishableKey, cohortId });
}

async function attemptNonleaderGroupRename(
  page: Page,
  apiUrl: string,
  publishableKey: string,
  groupId: string,
) {
  return page.evaluate(async ({ apiUrl, publishableKey, groupId }) => {
    const session = Object.values(localStorage)
      .map((value) => {
        try {
          return JSON.parse(value) as { access_token?: unknown };
        } catch {
          return null;
        }
      })
      .find((value) => typeof value?.access_token === "string");
    if (typeof session?.access_token !== "string") {
      throw new Error("STUDENT_SESSION_NOT_AVAILABLE");
    }
    const response = await fetch(
      `${apiUrl}/functions/v1/manage-group-identity`,
      {
        method: "POST",
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${session.access_token}`,
          Origin: window.location.origin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "rename",
          groupId,
          displayName: "Denied rename",
          requestKey: crypto.randomUUID(),
        }),
      },
    );
    const payload = await response.json().catch(() => null) as {
      error?: unknown;
    } | null;
    return {
      status: response.status,
      error: typeof payload?.error === "string" ? payload.error : null,
    };
  }, { apiUrl, publishableKey, groupId });
}

test("runs a clean teacher and two isolated students through recoverable class entry", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  expect(teacherEmail).not.toBe("");
  expect(teacherPassword).not.toBe("");
  expect(apiUrl).not.toBe("");
  expect(publishableKey).not.toBe("");
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
      teacherPage.getByRole("heading", { name: className }),
    ).toBeVisible();

    const groupTable = await openClassroomSetup(teacherPage);
    const classLink = teacherPage.getByRole("link", {
      name: "Student application",
    });
    const classUrl = await classLink.getAttribute("href");
    expect(classUrl).toMatch(/#\/class\/[0-9a-f-]{36}$/i);
    const rows = await groupTable.locator("tbody tr").allTextContents();
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
    const nonleaderState = await readStudentState(
      studentPages[1],
      apiUrl,
      publishableKey,
    );
    await expect(attemptNonleaderGroupRename(
      studentPages[1],
      apiUrl,
      publishableKey,
      nonleaderState.groupId,
    )).resolves.toEqual({ status: 403, error: "GROUP_ACTION_DENIED" });
    await studentContexts[1].close();

    await teacherPage.reload();
    const readiness = await openStudentRoster(teacherPage);
    const leaderRow = readiness.getByRole("row").filter({
      hasText: "Synthetic Leader",
    });
    await expect(leaderRow).toContainText("Group leader");
    await expect(readiness.getByRole("row").filter({ hasText: "Synthetic Member" }))
      .not.toContainText("Group leader");

    const sessionControls = await openSessionControls(teacherPage);
    await sessionControls.getByRole("button", { name: "Launch quest" }).click();
    await teacherPage.getByRole("button", {
      name: `Confirm launch quest for ${className}`,
      exact: true,
    }).click();
    await expect(studentPages[0].getByRole("heading", { name: "Diagnostic Gate" }))
      .toBeVisible({ timeout: 15_000 });
    await answerCurrentItem(studentPages[0]);
    const stateBeforeContextLoss = await readStudentState(
      studentPages[0],
      apiUrl,
      publishableKey,
    );
    expect(stateBeforeContextLoss.attemptId).not.toBeNull();
    expect(stateBeforeContextLoss.lastAcceptedSequence).toBeGreaterThan(0);
    expect(stateBeforeContextLoss.acceptedSequences).toEqual([
      stateBeforeContextLoss.lastAcceptedSequence,
    ]);

    await sessionControls.getByRole("button", { name: "Close joining" }).click();
    await teacherPage.getByRole("button", {
      name: `Confirm close class joining for ${className}`,
      exact: true,
    }).click();
    await expect(
      teacherPage.locator("details.teacher-secondary-section > p").filter({
        hasText: "Joining is closed.",
      }),
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

    const stateAfterReturningLogin = await readStudentState(
      returningPage,
      apiUrl,
      publishableKey,
    );
    expect(stateAfterReturningLogin).toEqual(stateBeforeContextLoss);

    await returningPage.goto(teacherPage.url());
    await expect(returningPage.getByRole("heading", { name: "Teacher sign in" }))
      .toBeVisible();

    await expect(probeTeacherDashboard(
      returningPage,
      apiUrl,
      publishableKey,
      stateBeforeContextLoss.cohortId,
    )).resolves.toEqual({ status: 404, error: "COHORT_NOT_AVAILABLE" });

    await teacherPage.reload();
    const refreshedReadiness = await openStudentRoster(teacherPage);
    await expect(
      refreshedReadiness.getByRole("row").filter({ hasText: "Synthetic Leader" }),
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
