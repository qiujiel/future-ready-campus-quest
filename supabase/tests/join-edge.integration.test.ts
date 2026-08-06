import { createClient } from "@supabase/supabase-js";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing integration environment: ${name}`);
  return value;
}

const apiUrl = required("TEST_SUPABASE_URL");
const anonKey = required("TEST_SUPABASE_ANON_KEY");
const serviceRoleKey = required("TEST_SUPABASE_SERVICE_ROLE_KEY");
const allowedOrigin = "http://127.0.0.1:4173";

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
      joinCode: "ZZZZZZZZ",
      displayName: "Synthetic Learner",
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
  let studentId: string | undefined;

  try {
    const role = await admin
      .from("user_roles")
      .insert({ user_id: teacherId, role: "teacher" });
    if (role.error) throw role.error;
    const cohort = await admin
      .from("cohorts")
      .insert({
        teacher_id: teacherId,
        title: "Synthetic integration cohort",
        group_count: 1,
        group_capacity: 1,
      })
      .select("id")
      .single();
    if (cohort.error) throw cohort.error;
    cohortId = cohort.data.id;

    const teacherClient = createClient(apiUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Origin: allowedOrigin } },
    });
    const teacherSession = await teacherClient.auth.signInWithPassword({
      email: teacherEmail,
      password: teacherPassword,
    });
    if (teacherSession.error) throw teacherSession.error;
    const opened = await teacherClient.functions.invoke("manage-join-window", {
      body: {
        action: "open",
        cohortId,
        requestKey: crypto.randomUUID(),
      },
    });
    if (opened.error) throw opened.error;
    expect(opened.data).toMatchObject({
      studentUrl: "http://127.0.0.1:4173/#/join",
      groups: [
        {
          groupNumber: 1,
          joinCode: expect.stringMatching(/^[2-9A-HJ-NP-Z]{8}$/),
          enabled: true,
        },
      ],
    });
    const joinCode = String(opened.data.groups[0].joinCode);

    const response = await fetch(`${apiUrl}/functions/v1/join-cohort`, {
      method: "POST",
      headers: {
        Origin: allowedOrigin,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        joinCode,
        displayName: "Synthetic Integration Learner",
        requestKey: crypto.randomUUID(),
      }),
    });
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.identity).toMatchObject({
      cohortId,
      groupNumber: 1,
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
      expected: 1,
      joined: 1,
      joining: {
        open: true,
        studentUrl: "http://127.0.0.1:4173/#/join",
      },
      groups: [
        {
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
        },
      ],
    });
    expect(JSON.stringify(readiness.data)).not.toContain("requestKey");
    expect(JSON.stringify(readiness.data)).not.toContain("joinWindowId");

    const studentClient = createClient(apiUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Origin: allowedOrigin } },
    });
    const studentSession = await studentClient.auth.setSession({
      access_token: String(payload.accessToken),
      refresh_token: String(payload.refreshToken),
    });
    if (studentSession.error) throw studentSession.error;
    const deniedReadiness = await studentClient.functions.invoke(
      "teacher-dashboard",
      { body: { cohortId, view: "readiness" } },
    );
    expect(deniedReadiness.error).not.toBeNull();

    const stored = await teacherClient
      .from("student_private_profiles")
      .select("real_name,cohort_id,group_id")
      .eq("student_id", studentId)
      .single();
    if (stored.error) throw stored.error;
    expect(stored.data.real_name).toBe("Synthetic Integration Learner");
  } finally {
    if (studentId) await admin.auth.admin.deleteUser(studentId, false);
    if (cohortId) await admin.from("cohorts").delete().eq("id", cohortId);
    await admin.auth.admin.deleteUser(teacherId, false);
  }
});
