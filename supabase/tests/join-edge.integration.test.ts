import { createClient } from "@supabase/supabase-js";

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
    const cohort = await admin
      .from("cohorts")
      .insert({
        teacher_id: teacherId,
        title: "Synthetic integration cohort",
        group_count: 2,
        group_capacity: 2,
      })
      .select("id,student_access_id")
      .single();
    if (cohort.error) throw cohort.error;
    cohortId = cohort.data.id;
    classAccessId = cohort.data.student_access_id;

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
    const opened = await teacherClient.functions.invoke("manage-join-window", {
      body: {
        action: "open",
        cohortId,
        requestKey: crypto.randomUUID(),
      },
    });
    if (opened.error) throw opened.error;
    expect(opened.data).toMatchObject({
      studentUrl: `${frontendAppUrl}/#/join`,
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
        wantsLeader: true,
        requestKey: crypto.randomUUID(),
      }),
    });
    const payload = await response.json();
    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.identity).toMatchObject({
      cohortId,
      groupNumber: 1,
      isGroupIdentityEditor: true,
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
      expected: 4,
      joined: 1,
      joining: {
        open: true,
        studentUrl: `${frontendAppUrl}/#/join`,
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
          isGroupLeader: true,
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
    if (stored.error) throw stored.error;
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

    const launched = await teacherClient.functions.invoke("teacher-controls", {
      body: {
        action: "launch-quest",
        cohortId,
        requestKey: crypto.randomUUID(),
      },
    });
    if (launched.error) throw launched.error;
    expect(launched.data).toMatchObject({ affected: 1, actionState: "launched" });

    const ensuredAttempt = await studentClient.rpc(
      "ensure_student_quest_attempt",
    );
    if (ensuredAttempt.error || !ensuredAttempt.data) {
      throw ensuredAttempt.error ?? new Error("attempt was not created");
    }
    const attemptId = String(ensuredAttempt.data);
    let reachedReflection = false;
    for (let step = 0; step < 32; step += 1) {
      const state = await studentClient
        .from("quest_attempts")
        .select("status,current_phase,last_accepted_sequence")
        .eq("id", attemptId)
        .single();
      if (state.error) throw state.error;
      if (state.data.current_phase === "reflection") {
        reachedReflection = true;
        break;
      }
      const next = await studentClient.functions.invoke("get-next-item", {
        body: { attemptId },
      });
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
      const submitted = await studentClient.functions.invoke(
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

    const prompt = await studentClient.functions.invoke("complete-quest", {
      body: { action: "prompt", attemptId },
    });
    if (prompt.error) throw prompt.error;
    expect(prompt.data.prompt.conceptId).toMatch(/^C[1-8]$/);
    const completed = await studentClient.functions.invoke("complete-quest", {
      body: {
        action: "complete",
        attemptId,
        idempotencyKey: crypto.randomUUID(),
        reflectionChoice: "apply",
        reflectionNote: "Synthetic integration reflection.",
      },
    });
    if (completed.error) throw completed.error;
    expect(completed.data.result.attemptId).toBe(attemptId);

    const teacherSummary = await teacherClient.functions.invoke(
      "teacher-dashboard",
      { body: { cohortId } },
    );
    if (teacherSummary.error) throw teacherSummary.error;
    expect(teacherSummary.data.summary.completed).toBe(1);

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
        joinCode,
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
    expect(afterRemoval.data.readiness.joined).toBe(0);
    const removedStudentCohorts = await studentClient
      .from("cohorts")
      .select("id")
      .eq("id", cohortId);
    if (removedStudentCohorts.error) throw removedStudentCohorts.error;
    expect(removedStudentCohorts.data).toEqual([]);
  } finally {
    if (studentId) await admin.auth.admin.deleteUser(studentId, false);
    if (cohortId) await admin.from("cohorts").delete().eq("id", cohortId);
    await admin.auth.admin.deleteUser(teacherId, false);
  }
});
