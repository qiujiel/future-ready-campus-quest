import { readDedicatedLoadConfiguration } from "../../scripts/load-project-guard.mjs";
import {
  createLoadFixture,
  deleteLoadFixture,
  launchLoadQuest,
} from "../../scripts/load-test-fixture.mjs";
import { parseJoinServerTiming } from "./server-timing.js";
import {
  buildJoinPhaseEvidence,
  CLASSROOM_JOIN_P95_LIMIT_MS,
  classroomLoadGateFailures,
} from "./class-session-policy.js";

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
  const configuration = readDedicatedLoadConfiguration(process.env);
  const { apiUrl, publishableKey } = configuration;
  const fixture = await createLoadFixture(configuration);
  const { admin, teacherToken, cohortId, groupCodes } = fixture;
  const joinLatencies = [];
  const joinStageLatencies = {
    find: [],
    preflight: [],
    create: [],
    sign: [],
    complete: [],
  };
  const responseLatencies = [];
  const studentIds = [];
  const joinedStudents = [];
  let authorizedFailures = 0;

  function requireAuthorized(response, label) {
    if (response.ok) return;
    authorizedFailures += 1;
    throw new Error(`${label} ${response.status}`);
  }

  try {
    const joinResults = await Promise.all(
      Array.from({ length: studentCount }, async (_, index) => {
        const expectedGroupNumber = Math.floor(index / studentsPerGroup) + 1;
        try {
          const joined = await timed(async () => {
            const response = await fetch(`${apiUrl}/functions/v1/join-cohort`, {
              method: "POST",
              headers: {
                apikey: publishableKey,
                Origin: "http://127.0.0.1:4173",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                joinCode: groupCodes[expectedGroupNumber - 1],
                displayName: `Load Learner ${index + 1}`,
                requestKey: crypto.randomUUID(),
              }),
            });
            requireAuthorized(response, "join");
            const stageTimings = parseJoinServerTiming(
              response.headers.get("server-timing"),
            );
            for (const [stage, duration] of Object.entries(stageTimings)) {
              joinStageLatencies[stage].push(duration);
            }
            return response.json();
          });
          joinLatencies.push(joined.duration);
          studentIds.push(joined.value.identity.studentId);
          joinedStudents.push({
            studentId: joined.value.identity.studentId,
            expectedGroupNumber,
            actualGroupNumber: joined.value.identity.groupNumber,
          });
          return {
            studentId: joined.value.identity.studentId,
            accessToken: joined.value.accessToken,
          };
        } catch {
          return null;
        }
      }),
    );
    const sessions = joinResults.filter((session) => session !== null);
    const joinEvidence = buildJoinPhaseEvidence({
      authorizedFailures,
      joinLatencies,
      joinStageLatencies,
      joinedStudents,
    });
    process.stdout.write(`Join phase evidence: ${JSON.stringify(joinEvidence)}\n`);
    if (
      joinEvidence.authorizedFailures !== 0 ||
      joinEvidence.studentsJoined !== studentCount ||
      joinEvidence.failedJoins !== 0 ||
      joinEvidence.incorrectGroupAssignments !== 0 ||
      joinEvidence.duplicateStudentIdentities !== 0 ||
      !Number.isFinite(joinEvidence.p95JoinMs) ||
      joinEvidence.p95JoinMs >= CLASSROOM_JOIN_P95_LIMIT_MS
    ) {
      throw new Error(`Load join gate failed: ${JSON.stringify(joinEvidence)}`);
    }

    await launchLoadQuest(configuration, fixture);
    const attempts = await admin
      .from("quest_attempts")
      .select("id,student_id")
      .eq("cohort_id", cohortId)
      .eq("status", "active");
    if (attempts.error || attempts.data?.length !== studentCount) {
      throw new Error("load attempts unavailable");
    }
    const attemptByStudent = new Map(
      attempts.data.map((attempt) => [
        String(attempt.student_id),
        String(attempt.id),
      ]),
    );
    const launchedSessions = sessions.map((session) => ({
      ...session,
      attemptId: attemptByStudent.get(session.studentId),
    }));
    if (launchedSessions.some((session) => !session.attemptId)) {
      throw new Error("load attempt mapping failed");
    }

    const completions = await Promise.all(
      launchedSessions.map(async (session) => {
        let sequence = 0;
        for (let step = 0; step < 40; step += 1) {
          const itemResponse = await fetch(
            `${apiUrl}/functions/v1/get-next-item`,
            {
              method: "POST",
              headers: {
                apikey: publishableKey,
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
                  apikey: publishableKey,
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
              apikey: publishableKey,
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
      }),
    );

    const dashboard = await timed(async () => {
      const response = await fetch(
        `${apiUrl}/functions/v1/teacher-dashboard`,
        {
          method: "POST",
          headers: {
            apikey: publishableKey,
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
          apikey: publishableKey,
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
      ...joinEvidence,
      authorizedFailures,
      unauthorizedAccepted: unauthorizedDashboard.ok ? 1 : 0,
      p95ResponseMs: percentile(responseLatencies, 95),
      p95DashboardMs: dashboard.duration,
      duplicateResponses: keys.length - new Set(keys).size,
      completedStudents: summary.completed,
      groups: teamScores.length,
      groupsWithValidScores: validTeamScores.length,
      students: studentCount,
      studentsWithVerifiedFormula: validFormulaResults,
    };
    const gateFailures = classroomLoadGateFailures(metrics);
    if (gateFailures.length > 0) {
      throw new Error(
        `Load gate failed (${gateFailures.join(", ")}): ${JSON.stringify(metrics)}`,
      );
    }
    process.stdout.write(`${JSON.stringify(metrics, null, 2)}\n`);
  } finally {
    await deleteLoadFixture(fixture, studentIds);
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
