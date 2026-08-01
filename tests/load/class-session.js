import { createClient } from "@supabase/supabase-js";
import { readDedicatedLoadConfiguration } from "../../scripts/load-project-guard.mjs";

const studentCount = 30;
const groupCount = 5;
const studentsPerGroup = 6;

function percentile(values, percentileValue) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil((percentileValue / 100) * sorted.length) - 1] ?? 0;
}

async function timed(action) {
  const started = performance.now();
  const value = await action();
  return { value, duration: performance.now() - started };
}

async function liveRun() {
  const {
    apiUrl,
    anonKey,
    serviceKey,
    teacherToken,
    cohortId,
    joinToken,
    contentVersionId,
  } = readDedicatedLoadConfiguration(process.env);
  const admin = createClient(apiUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const joinLatencies = [];
  const responseLatencies = [];
  const studentIds = [];
  let authorizedFailures = 0;

  function requireAuthorized(response, label) {
    if (response.ok) return;
    authorizedFailures += 1;
    throw new Error(`${label} ${response.status}`);
  }

  try {
    const sessions = await Promise.all(
      Array.from({ length: studentCount }, async (_, index) => {
        const joined = await timed(async () => {
          const response = await fetch(`${apiUrl}/functions/v1/join-cohort`, {
            method: "POST",
            headers: {
              apikey: anonKey,
              Origin: "http://127.0.0.1:4173",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              joinToken,
              groupNumber: Math.floor(index / studentsPerGroup) + 1,
              realName: `Load Learner ${index + 1}`,
              nickname: `Load ${index + 1}`,
              privacyConfirmed: true,
              requestKey: crypto.randomUUID(),
            }),
          });
          requireAuthorized(response, "join");
          return response.json();
        });
        joinLatencies.push(joined.duration);
        studentIds.push(joined.value.identity.studentId);
        const attemptId = crypto.randomUUID();
        const attempt = await admin.from("quest_attempts").insert({
          id: attemptId,
          student_id: joined.value.identity.studentId,
          cohort_id: cohortId,
          content_version_id: contentVersionId,
          current_phase: "diagnostic",
          phase_deadline_at: new Date(Date.now() + 30 * 60_000).toISOString(),
        });
        if (attempt.error) throw attempt.error;
        return {
          attemptId,
          accessToken: joined.value.accessToken,
        };
      }),
    );

    const completions = await Promise.all(sessions.map(async (session) => {
      let sequence = 0;
      for (let step = 0; step < 40; step += 1) {
        const itemResponse = await fetch(
          `${apiUrl}/functions/v1/get-next-item`,
          {
            method: "POST",
            headers: {
              apikey: anonKey,
              Authorization: `Bearer ${session.accessToken}`,
              Origin: "http://127.0.0.1:4173",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ attemptId: session.attemptId }),
          },
        );
        requireAuthorized(itemResponse, "item");
        const { item } = await itemResponse.json();
        if (!item) break;
        sequence += 1;
        const optionIds = item.interaction.options?.map((option) => option.id)
          ?? item.interaction.prompts?.map((prompt) => prompt.id)
          ?? ["A"];
        const submitted = await timed(async () => {
          const response = await fetch(
            `${apiUrl}/functions/v1/submit-response`,
            {
              method: "POST",
              headers: {
                apikey: anonKey,
                Authorization: `Bearer ${session.accessToken}`,
                Origin: "http://127.0.0.1:4173",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                attemptId: session.attemptId,
                assignmentId: item.assignmentId,
                idempotencyKey: crypto.randomUUID(),
                selectedOptionIds: optionIds.slice(0, 1),
                clientSequence: sequence,
                confidence: "somewhat_sure",
              }),
            },
          );
          requireAuthorized(response, "response");
          return response.json();
        });
        responseLatencies.push(submitted.duration);
      }
      const completionResponse = await fetch(
        `${apiUrl}/functions/v1/complete-quest`,
        {
          method: "POST",
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${session.accessToken}`,
            Origin: "http://127.0.0.1:4173",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "complete",
            attemptId: session.attemptId,
            idempotencyKey: crypto.randomUUID(),
            reflectionChoice: "apply",
          }),
        },
      );
      requireAuthorized(completionResponse, "completion");
      return completionResponse.json();
    }));

    const dashboard = await timed(async () => {
      const response = await fetch(
        `${apiUrl}/functions/v1/teacher-dashboard`,
        {
          method: "POST",
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${teacherToken}`,
            Origin: "http://127.0.0.1:4173",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ cohortId }),
        },
      );
      requireAuthorized(response, "dashboard");
      return response.json();
    });
    const unauthorizedDashboard = await fetch(
      `${apiUrl}/functions/v1/teacher-dashboard`,
      {
        method: "POST",
        headers: {
          apikey: anonKey,
          Origin: "http://127.0.0.1:4173",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cohortId }),
      },
    );

    const duplicateCheck = await admin
      .from("student_responses")
      .select("attempt_id,client_sequence");
    if (duplicateCheck.error) throw duplicateCheck.error;
    const keys = (duplicateCheck.data ?? []).map(
      (row) => `${row.attempt_id}:${row.client_sequence}`,
    );
    const summary = dashboard.value.summary;
    const teamScores = summary.teamScores ?? [];
    const validTeamScores = teamScores.filter(
      (team) =>
        team.completedMembers === studentsPerGroup &&
        team.enrolledMembers === studentsPerGroup &&
        Number.isFinite(team.score),
    );
    const validFormulaResults = completions.filter(
      (completion) =>
        completion.result?.formulaVersion === "team-score-60-25-10-5-v1",
    ).length;
    const metrics = {
      authorizedFailures,
      unauthorizedAccepted: unauthorizedDashboard.ok ? 1 : 0,
      p95JoinMs: percentile(joinLatencies, 95),
      p95ResponseMs: percentile(responseLatencies, 95),
      p95DashboardMs: dashboard.duration,
      duplicateResponses: keys.length - new Set(keys).size,
      completedStudents: summary.completed,
      groups: teamScores.length,
      groupsWithValidScores: validTeamScores.length,
      students: studentCount,
      studentsWithVerifiedFormula: validFormulaResults,
    };
    if (
      metrics.authorizedFailures !== 0 ||
      metrics.unauthorizedAccepted !== 0 ||
      metrics.p95JoinMs >= 1_500 ||
      metrics.p95ResponseMs >= 1_500 ||
      metrics.p95DashboardMs >= 2_500 ||
      metrics.duplicateResponses !== 0 ||
      metrics.completedStudents !== studentCount ||
      metrics.groups !== groupCount ||
      metrics.groupsWithValidScores !== groupCount ||
      metrics.studentsWithVerifiedFormula !== studentCount
    ) {
      throw new Error(`Load gate failed: ${JSON.stringify(metrics)}`);
    }
    process.stdout.write(`${JSON.stringify(metrics, null, 2)}\n`);
  } finally {
    for (const studentId of studentIds) {
      await admin.auth.admin.deleteUser(studentId);
    }
  }
}

if (process.argv.includes("--plan")) {
  if (
    studentCount !== groupCount * studentsPerGroup ||
    groupCount !== 5 ||
    studentsPerGroup !== 6
  ) {
    throw new Error("The representative class must be five groups of six.");
  }
  process.stdout.write(
    "Load plan valid: 30 students, five groups of six, unique request keys, cleanup enabled.\n",
  );
} else {
  await liveRun();
}
