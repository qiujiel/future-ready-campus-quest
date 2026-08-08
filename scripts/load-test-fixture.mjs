import { createClient } from "@supabase/supabase-js";

const loadOrigin = "http://127.0.0.1:4173";

export function createSyntheticLoadContent() {
  return {
    version: "synthetic-live-load-v1",
    items: Array.from({ length: 8 }, (_, conceptIndex) =>
      Array.from({ length: 3 }, (_, questionIndex) => {
        const conceptNumber = conceptIndex + 1;
        const questionNumber = questionIndex + 1;
        return {
          id: `C${conceptNumber}-Q${questionNumber}`,
          conceptId: `C${conceptNumber}`,
          form: ["diagnostic", "practice", "final"][questionIndex],
          stem:
            `Synthetic load-test item ${conceptNumber}-${questionNumber} verifies classroom throughput only.`,
          interaction: {
            kind: "single-choice",
            options: [
              { id: "A", text: "Synthetic option A" },
              { id: "B", text: "Synthetic option B" },
            ],
            correctOptionIds: ["A"],
          },
          rationale:
            "Synthetic option A is correct only for this non-production load test.",
          misconceptionTags: [`C${conceptNumber}-LOAD`],
          sourceRefs: [{ document: "overview-ict", pageStart: 1 }],
        };
      })
    ).flat(),
  };
}

function clientOptions(headers = {}) {
  return {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers },
  };
}

async function invoke(apiUrl, publishableKey, name, accessToken, body) {
  const response = await fetch(`${apiUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      Origin: loadOrigin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${name} ${response.status}`);
  return response.json();
}

export async function createLoadFixture({ apiUrl, publishableKey, secretKey }) {
  const admin = createClient(apiUrl, secretKey, clientOptions());
  const imported = await admin.rpc("import_learning_content", {
    payload: createSyntheticLoadContent(),
  });
  if (imported.error) throw new Error("Synthetic load content import failed.");

  const email = `load-${crypto.randomUUID()}@load.invalid`;
  const password = `Load-${crypto.randomUUID()}-Aa1!`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "teacher", fixture: "live-load" },
  });
  if (created.error || !created.data.user) {
    throw new Error("Synthetic load teacher creation failed.");
  }
  const teacherId = created.data.user.id;
  let createdCohortId = null;

  try {
    const role = await admin.from("user_roles").insert({
      user_id: teacherId,
      role: "teacher",
    });
    if (role.error) throw new Error("Synthetic load teacher role failed.");

    const publicClient = createClient(apiUrl, publishableKey, clientOptions());
    const signedIn = await publicClient.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) {
      throw new Error("Synthetic load teacher sign-in failed.");
    }
    const teacherToken = signedIn.data.session.access_token;
    const cohortReceipt = await invoke(
      apiUrl,
      publishableKey,
      "manage-join-window",
      teacherToken,
      {
        action: "create-cohort",
        title: "Synthetic 30-student load fixture",
        groupCount: 5,
        groupCapacity: 6,
        requestKey: crypto.randomUUID(),
      },
    );
    const cohortValue = Array.isArray(cohortReceipt.cohort)
      ? cohortReceipt.cohort[0]
      : cohortReceipt.cohort;
    const cohortId = cohortValue?.id;
    if (typeof cohortId !== "string") {
      throw new Error("Synthetic load cohort receipt missing.");
    }
    createdCohortId = cohortId;
    const joinReceipt = await invoke(
      apiUrl,
      publishableKey,
      "manage-join-window",
      teacherToken,
      { action: "open", cohortId, requestKey: crypto.randomUUID() },
    );
    if (!Array.isArray(joinReceipt.groups) || joinReceipt.groups.length !== 5) {
      throw new Error("Synthetic load group codes missing.");
    }
    return {
      admin,
      teacherId,
      teacherToken,
      cohortId,
      groupCodes: joinReceipt.groups.map((group) => String(group.joinCode)),
    };
  } catch (error) {
    if (createdCohortId) {
      await admin.from("cohorts").delete().eq("id", createdCohortId);
    }
    await admin.auth.admin.deleteUser(teacherId, false);
    throw error;
  }
}

export async function launchLoadQuest(configuration, fixture) {
  return invoke(
    configuration.apiUrl,
    configuration.publishableKey,
    "teacher-controls",
    fixture.teacherToken,
    {
      action: "launch-quest",
      cohortId: fixture.cohortId,
      requestKey: crypto.randomUUID(),
    },
  );
}

export async function deleteLoadFixture(fixture, studentIds) {
  for (const studentId of studentIds) {
    const removed = await fixture.admin.auth.admin.deleteUser(studentId, false);
    if (removed.error) throw new Error("Synthetic load student cleanup failed.");
  }
  const cohort = await fixture.admin
    .from("cohorts")
    .delete()
    .eq("id", fixture.cohortId);
  if (cohort.error) throw new Error("Synthetic load cohort cleanup failed.");
  const teacher = await fixture.admin.auth.admin.deleteUser(
    fixture.teacherId,
    false,
  );
  if (teacher.error) throw new Error("Synthetic load teacher cleanup failed.");
}
