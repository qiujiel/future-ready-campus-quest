import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing integration environment: ${name}`);
  return value;
}

const apiUrl = required("TEST_SUPABASE_URL");
const anonKey = required("TEST_SUPABASE_ANON_KEY");
const serviceRoleKey = required("TEST_SUPABASE_SERVICE_ROLE_KEY");
const allowedOrigin = process.env.TEST_FRONTEND_ORIGIN ??
  "http://127.0.0.1:4173";
const frontendAppUrl = (
  process.env.TEST_FRONTEND_APP_URL ?? allowedOrigin
).replace(/\/$/, "");

function syntheticContentBank() {
  return {
    version: "public-synthetic-edge-integration-v1",
    items: Array.from({ length: 8 }, (_, conceptIndex) =>
      Array.from({ length: 3 }, (_, questionIndex) => {
        const conceptNumber = conceptIndex + 1;
        const questionNumber = questionIndex + 1;
        return {
          id: `C${conceptNumber}-Q${questionNumber}`,
          conceptId: `C${conceptNumber}`,
          form: questionNumber === 1
            ? "diagnostic"
            : questionNumber === 2
              ? "practice"
              : "final",
          stem:
            `Synthetic integration item ${conceptNumber}-${questionNumber} contains no protected course content.`,
          interaction: {
            kind: "single-choice",
            options: [
              { id: "A", text: "Synthetic option A" },
              { id: "B", text: "Synthetic option B" },
              { id: "C", text: "Synthetic option C" },
            ],
            correctOptionIds: ["A"],
          },
          rationale:
            "Synthetic option A is marked correct only for integration testing.",
          misconceptionTags: [`C${conceptNumber}-M1`],
          sourceRefs: [
            { document: "overview-ict", pageStart: conceptNumber },
          ],
        };
      }),
    ).flat(),
  };
}

async function authUserCount(): Promise<number> {
  const admin = createClient(apiUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw users.error;
  return users.data.users.length;
}

function seedCredentiallessProfiles(input: {
  studentId: string;
  cohortId: string;
  groupId: string;
}) {
  for (const value of Object.values(input)) {
    if (!/^[a-f0-9-]{36}$/i.test(value)) {
      throw new Error("Invalid credentialless integration fixture UUID");
    }
  }
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      process.env.TEST_SUPABASE_DB_CONTAINER ??
        "supabase_db_future-ready-campus-quest",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      input: `
        insert into public.student_private_profiles (
          student_id, cohort_id, group_id, real_name
        ) values (
          '${input.studentId}', '${input.cohortId}', '${input.groupId}',
          'Legacy Credentialless Learner'
        );
        insert into public.student_public_profiles (
          student_id, cohort_id, group_id, nickname
        ) values (
          '${input.studentId}', '${input.cohortId}', '${input.groupId}',
          'Legacy Explorer'
        );
      `,
      stdio: ["pipe", "ignore", "pipe"],
    },
  );
}

function studentLoginRateKeyHash(requestKey: string): string {
  if (!/^[a-f0-9-]{36}$/i.test(requestKey)) {
    throw new Error("Invalid login-attempt integration fixture UUID");
  }
  return execFileSync(
    "docker",
    [
      "exec",
      process.env.TEST_SUPABASE_DB_CONTAINER ??
        "supabase_db_future-ready-campus-quest",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-tA",
      "-c",
      `select rate_key_hash from private.student_login_attempts where id = '${requestKey}'`,
    ],
    { encoding: "utf8" },
  ).trim();
}

function clearIntegrationGroupLeader(groupId: string) {
  if (!/^[a-f0-9-]{36}$/i.test(groupId)) {
    throw new Error("Invalid leaderless integration fixture UUID");
  }
  execFileSync(
    "docker",
    [
      "exec",
      process.env.TEST_SUPABASE_DB_CONTAINER ??
        "supabase_db_future-ready-campus-quest",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `update public.groups set identity_editor_id = null where id = '${groupId}'`,
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
}

it("rejects an unknown group code before creating a synthetic Auth user", async () => {
  const before = await authUserCount();
  const response = await fetch(`${apiUrl}/functions/v1/join-cohort`, {
    method: "POST",
    headers: {
      Origin: allowedOrigin,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      classAccessId: crypto.randomUUID(),
      joinCode: "ZZZZZZZZ",
      displayName: "Synthetic Learner",
      passcode: "4825",
      wantsLeader: false,
      requestKey: crypto.randomUUID(),
    }),
  });

  expect(response.status).toBe(404);
  expect(await response.json()).toEqual({ error: "INVALID_JOIN_CODE" });
  expect(await authUserCount()).toBe(before);
});

it("rejects anonymous recovery requests without a browser Origin", async () => {
  const response = await fetch(`${apiUrl}/functions/v1/recover-student`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "redeem",
      recoveryToken: "invalid-recovery-token-with-sufficient-entropy",
      requestKey: crypto.randomUUID(),
    }),
  });

  expect(response.status).toBe(403);
});

it("rejects returning student login without a browser Origin", async () => {
  const response = await fetch(`${apiUrl}/functions/v1/student-login`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      classAccessId: crypto.randomUUID(),
      displayName: "Synthetic Learner",
      passcode: "4826",
      requestKey: crypto.randomUUID(),
    }),
  });

  expect(response.status).toBe(403);
});

it("completes a valid join against real Auth and database boundaries", async () => {
  const admin = createClient(apiUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const teacherEmail = `${crypto.randomUUID()}@teacher.integration.invalid`;
  const teacherPassword = `${crypto.randomUUID()}-GateD!`;
  const teacher = await admin.auth.admin.createUser({
    email: teacherEmail,
    password: teacherPassword,
    email_confirm: true,
    app_metadata: { role: "teacher" },
  });
  if (teacher.error || !teacher.data.user) throw teacher.error;
  const teacherId = teacher.data.user.id;
  let cohortId: string | undefined;
  let classAccessId: string | undefined;
  let studentId: string | undefined;
  let credentiallessStudentId: string | undefined;

  try {
    const content = await admin.rpc(
      "import_learning_content",
      { payload: syntheticContentBank() },
    );
    if (content.error) throw content.error;
    const role = await admin
      .from("user_roles")
      .insert({ user_id: teacherId, role: "teacher" });
    if (role.error) throw role.error;
    const teacherClient = createClient(apiUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Origin: allowedOrigin } },
    });
    const teacherSession = await teacherClient.auth.signInWithPassword({
      email: teacherEmail,
      password: teacherPassword,
    });
    if (teacherSession.error) throw teacherSession.error;
    const teacherRole = await teacherClient.rpc("current_role");
    expect(teacherRole.error).toBeNull();
    expect(teacherRole.data).toBe("teacher");
    const created = await teacherClient.functions.invoke("manage-join-window", {
      body: {
        action: "create-cohort",
        title: "Synthetic integration class",
        groupCount: 2,
        requestKey: crypto.randomUUID(),
      },
    });
    if (created.error) throw created.error;
    const createdCohort = Array.isArray(created.data.cohort)
      ? created.data.cohort[0]
      : created.data.cohort;
    cohortId = String(createdCohort.id);
    classAccessId = String(createdCohort.student_access_id);
    expect(createdCohort).toMatchObject({
      group_count: 2,
      group_capacity: 20,
    });

    const opened = await teacherClient.functions.invoke("manage-join-window", {
      body: {
        action: "open",
        cohortId,
        requestKey: crypto.randomUUID(),
      },
    });
    if (opened.error) throw opened.error;
    expect(opened.data).toMatchObject({
      studentUrl: `${frontendAppUrl}/#/class/${classAccessId}`,
      groups: [
        {
          groupNumber: 1,
          joinCode: expect.stringMatching(/^[2-9A-HJ-NP-Z]{8}$/),
          enabled: true,
        },
        {
          groupNumber: 2,
          joinCode: expect.stringMatching(/^[2-9A-HJ-NP-Z]{8}$/),
          enabled: true,
        },
      ],
    });
    expect(new Set(opened.data.groups.map(
      (group: { joinCode: string }) => group.joinCode,
    )).size).toBe(2);
    const joinCode = String(opened.data.groups[0].joinCode);

    const usersBeforeClassMismatch = await authUserCount();
    const classMismatch = await fetch(`${apiUrl}/functions/v1/join-cohort`, {
      method: "POST",
      headers: {
        Origin: allowedOrigin,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        classAccessId: crypto.randomUUID(),
        joinCode,
        displayName: "Rejected Class Mismatch",
        passcode: "4827",
        wantsLeader: false,
        requestKey: crypto.randomUUID(),
      }),
    });
    expect(classMismatch.status).toBe(404);
    expect(await classMismatch.json()).toEqual({ error: "INVALID_JOIN_CODE" });
    expect(await authUserCount()).toBe(usersBeforeClassMismatch);

    const studentPasscode = "4826";
    const response = await fetch(`${apiUrl}/functions/v1/join-cohort`, {
      method: "POST",
      headers: {
        Origin: allowedOrigin,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        classAccessId,
        joinCode,
        displayName: "Synthetic Integration Learner",
        passcode: studentPasscode,
        wantsLeader: false,
        requestKey: crypto.randomUUID(),
      }),
    });
    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.identity).toMatchObject({
      cohortId,
      groupNumber: 1,
      isGroupIdentityEditor: false,
    });
    expect(payload.identity).not.toHaveProperty("realName");
    studentId = payload.identity.studentId;

    const readiness = await teacherClient.functions.invoke(
      "teacher-dashboard",
      { body: { cohortId, view: "readiness" } },
    );
    if (readiness.error) throw readiness.error;
    expect(readiness.data.readiness).toMatchObject({
      cohortId,
      expected: 40,
      joined: 1,
      joining: {
        open: true,
        studentUrl: `${frontendAppUrl}/#/class/${classAccessId}`,
      },
    });
    expect(
      readiness.data.readiness.groups.find(
        (group: { groupNumber: number }) => group.groupNumber === 1,
      ),
    ).toMatchObject({
      groupNumber: 1,
      joinCode,
      joinEnabled: true,
      students: [
        {
          studentId,
          displayName: "Synthetic Integration Learner",
          activityStatus: "joined",
        },
      ],
    });
    expect(JSON.stringify(readiness.data)).not.toContain("requestKey");
    expect(JSON.stringify(readiness.data)).not.toContain("joinWindowId");
    expect(JSON.stringify(readiness.data)).not.toContain(
      JSON.stringify(studentPasscode),
    );

    const studentClient = createClient(apiUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Origin: allowedOrigin } },
    });
    const studentSession = await studentClient.auth.setSession({
      access_token: String(payload.accessToken),
      refresh_token: String(payload.refreshToken),
    });
    if (studentSession.error) throw studentSession.error;
    expect(studentSession.data.user?.app_metadata.role).toBeUndefined();
    const studentRole = await studentClient.rpc("current_role");
    expect(studentRole.error).toBeNull();
    expect(studentRole.data).toBe("student");
    const deniedReadiness = await studentClient.functions.invoke(
      "teacher-dashboard",
      { body: { cohortId, view: "readiness" } },
    );
    expect(deniedReadiness.error).not.toBeNull();

    const credentiallessEmail =
      `${crypto.randomUUID()}@legacy-student.integration.invalid`;
    const credentiallessPassword = `${crypto.randomUUID()}-Legacy!`;
    const credentiallessUser = await admin.auth.admin.createUser({
      email: credentiallessEmail,
      password: credentiallessPassword,
      email_confirm: true,
    });
    if (credentiallessUser.error || !credentiallessUser.data.user) {
      throw credentiallessUser.error;
    }
    credentiallessStudentId = credentiallessUser.data.user.id;
    const credentiallessGroupId = String(opened.data.groups[0].groupId);
    const credentiallessRole = await admin.from("user_roles").insert({
      user_id: credentiallessStudentId,
      role: "student",
    });
    if (credentiallessRole.error) throw credentiallessRole.error;
    seedCredentiallessProfiles({
      studentId: credentiallessStudentId,
      cohortId,
      groupId: credentiallessGroupId,
    });
    const credentiallessClient = createClient(apiUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Origin: allowedOrigin } },
    });
    const credentiallessSession = await credentiallessClient.auth
      .signInWithPassword({
        email: credentiallessEmail,
        password: credentiallessPassword,
      });
    if (credentiallessSession.error) throw credentiallessSession.error;

    const questionBank = await teacherClient.functions.invoke(
      "teacher-dashboard",
      { body: { cohortId, view: "question-bank" } },
    );
    if (questionBank.error) throw questionBank.error;
    expect(questionBank.data.questionBank).toMatchObject({
      itemCount: 24,
      conceptCount: 8,
    });
    expect(questionBank.data.questionBank.items).toHaveLength(24);
    expect(questionBank.data.questionBank.items[0]).toHaveProperty(
      "correctResponse",
    );
    expect(
      JSON.stringify(questionBank.data.questionBank.items[0].interaction),
    ).not.toContain("correctOptionIds");
    const deniedQuestionBank = await studentClient.functions.invoke(
      "teacher-dashboard",
      { body: { cohortId, view: "question-bank" } },
    );
    expect(deniedQuestionBank.error).not.toBeNull();

    const stored = await teacherClient
      .from("student_private_profiles")
      .select("real_name,cohort_id,group_id")
      .eq("student_id", studentId)
      .single();
    if (stored.error) {
      throw new Error(`teacher private profile read: ${stored.error.message}`);
    }
    expect(stored.data.real_name).toBe("Synthetic Integration Learner");

    const targetGroupId = String(opened.data.groups[1].groupId);
    const moved = await teacherClient.functions.invoke("teacher-controls", {
      body: {
        action: "move-student",
        cohortId,
        studentId,
        groupId: targetGroupId,
        requestKey: crypto.randomUUID(),
      },
    });
    if (moved.error) throw moved.error;
    expect(moved.data).toMatchObject({ affected: 1, actionState: "applied" });

    const afterMove = await teacherClient.functions.invoke(
      "teacher-dashboard",
      { body: { cohortId, view: "readiness" } },
    );
    if (afterMove.error) throw afterMove.error;
    expect(
      afterMove.data.readiness.groups.find(
        (group: { groupNumber: number }) => group.groupNumber === 2,
      ).students[0],
    ).toMatchObject({ studentId, displayName: "Synthetic Integration Learner" });
    clearIntegrationGroupLeader(targetGroupId);

    const launched = await teacherClient.functions.invoke("teacher-controls", {
      body: {
        action: "launch-quest",
        cohortId,
        requestKey: crypto.randomUUID(),
      },
    });
    if (launched.error) throw launched.error;
    expect(launched.data).toMatchObject({ affected: 2, actionState: "launched" });

    const ensuredAttempt = await studentClient.rpc(
      "ensure_student_quest_attempt",
    );
    if (ensuredAttempt.error || !ensuredAttempt.data) {
      throw ensuredAttempt.error ?? new Error("attempt was not created");
    }
    const attemptId = String(ensuredAttempt.data);
    const credentiallessAttempt = await credentiallessClient.rpc(
      "ensure_student_quest_attempt",
    );
    if (credentiallessAttempt.error || !credentiallessAttempt.data) {
      throw credentiallessAttempt.error ??
        new Error("credentialless attempt was not created");
    }

    const closed = await teacherClient.functions.invoke(
      "manage-join-window",
      {
        body: {
          action: "close",
          cohortId,
          requestKey: crypto.randomUUID(),
        },
      },
    );
    if (closed.error) throw closed.error;
    expect(closed.data).toEqual({ closed: true });

    const usersBeforeLogin = await authUserCount();
    const loginRequest = async (
      displayName: string,
      passcode: string,
      requestedClassAccessId = classAccessId,
      extraHeaders: Record<string, string> = {},
      requestKey = crypto.randomUUID(),
    ) =>
      await fetch(`${apiUrl}/functions/v1/student-login`, {
        method: "POST",
        headers: {
          Origin: allowedOrigin,
          apikey: anonKey,
          "Content-Type": "application/json",
          ...extraHeaders,
        },
        body: JSON.stringify({
          classAccessId: requestedClassAccessId,
          displayName,
          passcode,
          requestKey,
        }),
      });

    const firstSpoofedRequestKey = crypto.randomUUID();
    const firstSpoofed = await loginRequest(
      "Spoofed Address One",
      "4826",
      classAccessId,
      {
        "x-real-ip": "198.51.100.10",
        "x-forwarded-for": "203.0.113.7, 192.0.2.9",
      },
      firstSpoofedRequestKey,
    );
    expect(firstSpoofed.status).toBe(401);
    const secondSpoofedRequestKey = crypto.randomUUID();
    const secondSpoofed = await loginRequest(
      "Spoofed Address Two",
      "4826",
      classAccessId,
      {
        "x-real-ip": "192.0.2.44",
        "x-forwarded-for": "198.51.100.77",
      },
      secondSpoofedRequestKey,
    );
    expect(secondSpoofed.status).toBe(401);
    expect(studentLoginRateKeyHash(secondSpoofedRequestKey)).toBe(
      studentLoginRateKeyHash(firstSpoofedRequestKey),
    );

    const expandedIpv6RequestKey = crypto.randomUUID();
    const expandedIpv6 = await loginRequest(
      "Gateway Address Expanded",
      "4826",
      classAccessId,
      {
        "cf-connecting-ip":
          "2001:0DB8:0000:0000:0000:0000:0000:0001",
        "x-real-ip": "198.51.100.100",
      },
      expandedIpv6RequestKey,
    );
    expect(expandedIpv6.status).toBe(401);
    const compressedIpv6RequestKey = crypto.randomUUID();
    const compressedIpv6 = await loginRequest(
      "Gateway Address Compressed",
      "4826",
      classAccessId,
      { "cf-connecting-ip": "2001:db8::1" },
      compressedIpv6RequestKey,
    );
    expect(compressedIpv6.status).toBe(401);
    expect(studentLoginRateKeyHash(compressedIpv6RequestKey)).toBe(
      studentLoginRateKeyHash(expandedIpv6RequestKey),
    );
    expect(studentLoginRateKeyHash(compressedIpv6RequestKey)).not.toBe(
      studentLoginRateKeyHash(firstSpoofedRequestKey),
    );

    const wrongName = await loginRequest("Unknown Integration Learner", "4826");
    const wrongNameBody = await wrongName.text();
    expect(wrongName.status).toBe(401);
    expect(wrongName.headers.get("server-timing")).toBeNull();
    const wrongPasscode = await loginRequest(
      "Synthetic Integration Learner",
      "1111",
    );
    const wrongPasscodeBody = await wrongPasscode.text();
    expect(wrongPasscode.status).toBe(401);
    const wrongClass = await loginRequest(
      "Synthetic Integration Learner",
      "4826",
      crypto.randomUUID(),
    );
    const wrongClassBody = await wrongClass.text();
    expect(wrongClass.status).toBe(401);
    expect(wrongPasscodeBody).toBe(wrongNameBody);
    expect(wrongClassBody).toBe(wrongNameBody);
    expect(wrongNameBody).toBe('{"error":"STUDENT_LOGIN_NOT_ACCEPTED"}');

    const credentiallessLogin = await loginRequest(
      "Legacy Credentialless Learner",
      "4826",
    );
    expect(credentiallessLogin.status).toBe(401);
    expect(await credentiallessLogin.text()).toBe(wrongNameBody);

    const returningLogin = await loginRequest(
      "Synthetic Integration Learner",
      studentPasscode,
    );
    const returningPayload = await returningLogin.json();
    expect(returningLogin.status, JSON.stringify(returningPayload)).toBe(200);
    expect(returningLogin.headers.get("server-timing")).toBeNull();
    expect(returningPayload.identity).toMatchObject({
      studentId,
      cohortId,
      groupId: targetGroupId,
      groupNumber: 2,
      isGroupIdentityEditor: false,
    });
    expect(JSON.stringify(returningPayload)).not.toContain(studentPasscode);
    expect(JSON.stringify(returningPayload)).not.toContain(
      "Synthetic Integration Learner",
    );
    expect(returningPayload).not.toHaveProperty("passcodeSalt");
    expect(returningPayload).not.toHaveProperty("passcodeHash");
    const returningStudentClient = createClient(apiUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Origin: allowedOrigin } },
    });
    const returningSession = await returningStudentClient.auth.setSession({
      access_token: String(returningPayload.accessToken),
      refresh_token: String(returningPayload.refreshToken),
    });
    if (returningSession.error) throw returningSession.error;
    expect(returningSession.data.user?.id).toBe(studentId);
    const returningRole = await returningStudentClient.rpc("current_role");
    expect(returningRole.error).toBeNull();
    expect(returningRole.data).toBe("student");
    const savedAttempt = await returningStudentClient
      .from("quest_attempts")
      .select("id,student_id")
      .eq("id", attemptId)
      .single();
    if (savedAttempt.error) throw savedAttempt.error;
    expect(savedAttempt.data).toMatchObject({
      id: attemptId,
      student_id: studentId,
    });
    expect(await authUserCount()).toBe(usersBeforeLogin);

    const credentiallessRecovery = await teacherClient.functions.invoke(
      "teacher-controls",
      {
        body: {
          action: "issue-recovery",
          cohortId,
          studentId: credentiallessStudentId,
          requestKey: crypto.randomUUID(),
        },
      },
    );
    if (credentiallessRecovery.error) throw credentiallessRecovery.error;
    const recoveryToken = String(credentiallessRecovery.data.recoveryUrl)
      .split("/#/recover/")[1];
    expect(recoveryToken).toMatch(/^[A-Za-z0-9_-]+$/);
    const redeemedCredentialless = await fetch(
      `${apiUrl}/functions/v1/recover-student`,
      {
        method: "POST",
        headers: {
          Origin: allowedOrigin,
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "redeem",
          recoveryToken,
          requestKey: crypto.randomUUID(),
        }),
      },
    );
    const redeemedCredentiallessPayload = await redeemedCredentialless.json();
    expect(
      redeemedCredentialless.status,
      JSON.stringify(redeemedCredentiallessPayload),
    ).toBe(200);
    expect(redeemedCredentiallessPayload.studentId).toBe(
      credentiallessStudentId,
    );
    expect(await authUserCount()).toBe(usersBeforeLogin);

    let reachedReflection = false;
    for (let step = 0; step < 32; step += 1) {
      const state = await returningStudentClient
        .from("quest_attempts")
        .select("status,current_phase,last_accepted_sequence")
        .eq("id", attemptId)
        .single();
      if (state.error) throw state.error;
      if (state.data.current_phase === "reflection") {
        reachedReflection = true;
        break;
      }
      const next = await returningStudentClient.functions.invoke(
        "get-next-item",
        { body: { attemptId } },
      );
      if (next.error) throw next.error;
      const item = next.data.item as {
        assignmentId: string;
        interaction: { options: Array<{ id: string }> };
      } | null;
      if (!item) {
        throw new Error(
          `integration item was not available at step ${step} in ${state.data.current_phase}`,
        );
      }
      expect(JSON.stringify(item)).not.toContain("correctOptionIds");
      const submitted = await returningStudentClient.functions.invoke(
        "submit-response",
        {
          body: {
            attemptId,
            assignmentId: item.assignmentId,
            idempotencyKey: crypto.randomUUID(),
            selectedOptionIds: [String(item.interaction.options[0]?.id)],
            clientSequence: Number(state.data.last_accepted_sequence) + 1,
          },
        },
      );
      if (submitted.error) throw submitted.error;
      expect(submitted.data.result.correct).toBe(true);
    }
    expect(reachedReflection).toBe(true);

    const prompt = await returningStudentClient.functions.invoke(
      "complete-quest",
      { body: { action: "prompt", attemptId } },
    );
    if (prompt.error) throw prompt.error;
    expect(prompt.data.prompt.conceptId).toMatch(/^C[1-8]$/);
    const completed = await returningStudentClient.functions.invoke(
      "complete-quest",
      {
        body: {
          action: "complete",
          attemptId,
          idempotencyKey: crypto.randomUUID(),
          reflectionChoice: "apply",
          reflectionNote: "Synthetic integration reflection.",
        },
      },
    );
    if (completed.error) throw completed.error;
    expect(completed.data.result.attemptId).toBe(attemptId);

    const teacherSummary = await teacherClient.functions.invoke(
      "teacher-dashboard",
      { body: { cohortId } },
    );
    if (teacherSummary.error) throw teacherSummary.error;
    expect(teacherSummary.data.summary.completed).toBe(1);

    const reopened = await teacherClient.functions.invoke(
      "teacher-controls",
      {
        body: {
          action: "open-join",
          cohortId,
          requestKey: crypto.randomUUID(),
        },
      },
    );
    if (reopened.error) throw reopened.error;
    const reopenedJoinCode = String(reopened.data.groups[0].joinCode);
    expect(reopened.data.studentUrl).toBe(
      `${frontendAppUrl}/#/class/${classAccessId}`,
    );
    expect(reopenedJoinCode).not.toBe(joinCode);

    const disabled = await teacherClient.functions.invoke("teacher-controls", {
      body: {
        action: "set-group-join",
        cohortId,
        groupId: String(opened.data.groups[0].groupId),
        enabled: false,
        requestKey: crypto.randomUUID(),
      },
    });
    if (disabled.error) throw disabled.error;
    expect(disabled.data).toMatchObject({ affected: 1, actionState: "disabled" });
    const usersBeforeDisabledJoin = await authUserCount();
    const disabledJoin = await fetch(`${apiUrl}/functions/v1/join-cohort`, {
      method: "POST",
      headers: {
        Origin: allowedOrigin,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        classAccessId,
        joinCode: reopenedJoinCode,
        displayName: "Rejected Disabled Learner",
        passcode: "4828",
        wantsLeader: false,
        requestKey: crypto.randomUUID(),
      }),
    });
    expect(disabledJoin.status).toBe(410);
    expect(await disabledJoin.json()).toEqual({ error: "GROUP_JOIN_CLOSED" });
    expect(await authUserCount()).toBe(usersBeforeDisabledJoin);

    const recovery = await teacherClient.functions.invoke("teacher-controls", {
      body: {
        action: "issue-recovery",
        cohortId,
        studentId,
        requestKey: crypto.randomUUID(),
      },
    });
    if (recovery.error) throw recovery.error;
    expect(recovery.data.recoveryUrl).toMatch(
      new RegExp(
        `^${frontendAppUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` +
          "/#/recover/[A-Za-z0-9_-]+$",
      ),
    );

    const removed = await teacherClient.functions.invoke("teacher-controls", {
      body: {
        action: "remove-student",
        cohortId,
        studentId,
        requestKey: crypto.randomUUID(),
      },
    });
    if (removed.error) throw removed.error;
    expect(removed.data).toMatchObject({ affected: 1, actionState: "applied" });

    const afterRemoval = await teacherClient.functions.invoke(
      "teacher-dashboard",
      { body: { cohortId, view: "readiness" } },
    );
    if (afterRemoval.error) throw afterRemoval.error;
    expect(afterRemoval.data.readiness.joined).toBe(1);
    const removedLogin = await fetch(`${apiUrl}/functions/v1/student-login`, {
      method: "POST",
      headers: {
        Origin: allowedOrigin,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        classAccessId,
        displayName: "Synthetic Integration Learner",
        passcode: studentPasscode,
        requestKey: crypto.randomUUID(),
      }),
    });
    expect(removedLogin.status).toBe(401);
    expect(await removedLogin.text()).toBe(wrongNameBody);
    expect(await authUserCount()).toBe(usersBeforeLogin);
    const removedStudentCohorts = await studentClient
      .from("cohorts")
      .select("id")
      .eq("id", cohortId);
    if (removedStudentCohorts.error) throw removedStudentCohorts.error;
    expect(removedStudentCohorts.data).toEqual([]);
  } finally {
    if (studentId) await admin.auth.admin.deleteUser(studentId, false);
    if (credentiallessStudentId) {
      await admin.auth.admin.deleteUser(credentiallessStudentId, false);
    }
    if (cohortId) await admin.from("cohorts").delete().eq("id", cohortId);
    await admin.auth.admin.deleteUser(teacherId, false);
  }
});
