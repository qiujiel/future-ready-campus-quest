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

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

it("rejects a closed join token before creating a synthetic Auth user", async () => {
  const before = await authUserCount();
  const response = await fetch(`${apiUrl}/functions/v1/join-cohort`, {
    method: "POST",
    headers: {
      Origin: allowedOrigin,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      joinToken: "invalid-shared-token-with-sufficient-entropy",
      groupNumber: 1,
      realName: "Synthetic Learner",
      privacyConfirmed: true,
      requestKey: crypto.randomUUID(),
    }),
  });

  expect(response.status).toBe(410);
  expect(await response.json()).toEqual({ error: "JOIN_WINDOW_CLOSED" });
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
  const teacher = await admin.auth.admin.createUser({
    email: `${crypto.randomUUID()}@teacher.integration.invalid`,
    password: `${crypto.randomUUID()}-GateD!`,
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

    const rawToken = `integration-${crypto.randomUUID()}-${crypto.randomUUID()}`;
    const joinWindow = await admin.from("cohort_join_windows").insert({
      cohort_id: cohortId,
      token_hash: await sha256Hex(rawToken),
      request_key: crypto.randomUUID(),
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      created_by: teacherId,
    });
    if (joinWindow.error) throw joinWindow.error;

    const response = await fetch(`${apiUrl}/functions/v1/join-cohort`, {
      method: "POST",
      headers: {
        Origin: allowedOrigin,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        joinToken: rawToken,
        groupNumber: 1,
        realName: "Synthetic Integration Learner",
        privacyConfirmed: true,
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
  } finally {
    if (studentId) await admin.auth.admin.deleteUser(studentId, false);
    if (cohortId) await admin.from("cohorts").delete().eq("id", cohortId);
    await admin.auth.admin.deleteUser(teacherId, false);
  }
});
