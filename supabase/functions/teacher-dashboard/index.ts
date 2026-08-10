import { z } from "npm:zod@4.4.3";
import { callerClient, frontendAppUrl } from "../_shared/auth.ts";
import { corsHeaders, RequestOriginError } from "../_shared/cors.ts";
import { jsonResponse, readJson } from "../_shared/http.ts";
import {
  loadTeacherDashboard,
  prepareClassroomReadiness,
  TeacherDashboardBoundaryError,
  type TeacherDashboardRepository,
  type TrustedReadinessReport,
} from "../_shared/teacher-dashboard-core.ts";
import {
  buildStudentClassUrl,
  loadTeacherStudentAccessId,
} from "../_shared/teacher-class-access.ts";
import type {
  ConceptId,
  SupportState,
  TeacherDashboardSummary,
  TeacherStudentDetail,
} from "../../../src/shared/api/contracts.ts";

const requestSchema = z.object({
  cohortId: z.uuid(),
  studentId: z.uuid().optional(),
  view: z.enum(["readiness", "question-bank"]).optional(),
});

Deno.serve(async (request) => {
  let headers: Record<string, string> = {};
  try {
    headers = corsHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "POST") {
      return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405, headers);
    }

    const input = requestSchema.parse(await readJson(request));
    const client = callerClient(request);
    const user = await client.auth.getUser();
    if (user.error || !user.data.user) {
      throw new TeacherDashboardBoundaryError(
        "COHORT_NOT_AVAILABLE",
        404,
      );
    }

    if (input.view === "readiness") {
      const result = await client.rpc(
        "get_teacher_classroom_readiness",
        { p_cohort_id: input.cohortId },
      );
      if (result.error || !result.data) {
        throw new TeacherDashboardBoundaryError(
          "COHORT_NOT_AVAILABLE",
          404,
        );
      }
      const signingSecret = Deno.env.get("JOIN_TOKEN_SIGNING_SECRET");
      if (!signingSecret || signingSecret.length < 32) {
        throw new Error("JOIN_TOKEN_SIGNING_SECRET is not configured.");
      }
      const studentAccessId = await loadTeacherStudentAccessId(
        client,
        input.cohortId,
      );
      const readiness = await prepareClassroomReadiness(
        result.data as TrustedReadinessReport,
        signingSecret,
        buildStudentClassUrl(frontendAppUrl(), studentAccessId),
      );
      return jsonResponse({ readiness }, 200, headers);
    }

    if (input.view === "question-bank") {
      const result = await client.rpc(
        "get_teacher_question_bank",
        { p_cohort_id: input.cohortId },
      );
      if (result.error || !result.data) {
        throw new TeacherDashboardBoundaryError(
          "COHORT_NOT_AVAILABLE",
          404,
        );
      }
      return jsonResponse({ questionBank: result.data }, 200, headers);
    }

    const repository: TeacherDashboardRepository = {
      async loadOwnedSummary(_actorUserId, cohortId) {
        const result = await client.rpc(
          "get_teacher_dashboard_summary",
          { p_cohort_id: cohortId },
        );
        if (result.error) return null;
        return result.data as TeacherDashboardSummary;
      },
    };
    const summary = await loadTeacherDashboard(
      user.data.user.id,
      input.cohortId,
      repository,
    );
    if (input.studentId) {
      const [profile, publicProfile, attempts] = await Promise.all([
        client
          .from("student_private_profiles")
          .select("student_id,real_name,group_id")
          .eq("cohort_id", input.cohortId)
          .eq("student_id", input.studentId)
          .maybeSingle(),
        client
          .from("student_public_profiles")
          .select("student_id,nickname")
          .eq("cohort_id", input.cohortId)
          .eq("student_id", input.studentId)
          .maybeSingle(),
        client
          .from("quest_attempts")
          .select("id")
          .eq("cohort_id", input.cohortId)
          .eq("student_id", input.studentId)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (
        profile.error ||
        !profile.data ||
        publicProfile.error ||
        !publicProfile.data ||
        attempts.error
      ) {
        throw new TeacherDashboardBoundaryError(
          "COHORT_NOT_AVAILABLE",
          404,
        );
      }
      const group = await client
        .from("groups")
        .select("display_name")
        .eq("cohort_id", input.cohortId)
        .eq("id", profile.data.group_id)
        .maybeSingle();
      if (group.error || !group.data) {
        throw new TeacherDashboardBoundaryError(
          "COHORT_NOT_AVAILABLE",
          404,
        );
      }
      const attemptId = attempts.data?.id;
      const [evidence, responses, reflection] = attemptId
        ? await Promise.all([
          client
            .from("concept_evidence")
            .select("concept_id,phase,support_state,correct_count,total_count")
            .eq("attempt_id", attemptId),
          client
            .from("student_responses")
            .select("phase,correct,misconception_tag")
            .eq("attempt_id", attemptId)
            .order("client_sequence"),
          client
            .from("quest_reflections")
            .select("reflection_note")
            .eq("attempt_id", attemptId)
            .maybeSingle(),
        ])
        : [
          { data: [], error: null },
          { data: [], error: null },
          { data: null, error: null },
        ];
      if (evidence.error || responses.error || reflection.error) {
        throw new TeacherDashboardBoundaryError(
          "COHORT_NOT_AVAILABLE",
          404,
        );
      }
      const rows = evidence.data ?? [];
      const stateFor = (
        conceptId: ConceptId,
        phase: "diagnostic" | "final",
      ): SupportState | "no_evidence" => {
        const row = rows.find(
          (candidate) =>
            candidate.concept_id === conceptId &&
            candidate.phase === phase,
        );
        return (row?.support_state as SupportState | undefined) ??
          "no_evidence";
      };
      const student: TeacherStudentDetail = {
        studentId: input.studentId,
        realName: String(profile.data.real_name),
        nickname: String(publicProfile.data.nickname),
        groupName: String(group.data.display_name),
        concepts: Array.from({ length: 8 }, (_, index) => {
          const conceptId = `C${index + 1}` as ConceptId;
          const retry = rows.find(
            (candidate) =>
              candidate.concept_id === conceptId &&
              candidate.phase === "retry",
          );
          return {
            conceptId,
            first: stateFor(conceptId, "diagnostic"),
            final: stateFor(conceptId, "final"),
            retry: retry
              ? `${retry.correct_count} of ${retry.total_count} correct`
              : "no evidence",
          };
        }),
        outcomes: (responses.data ?? []).map((response, index) => ({
          itemLabel: `${String(response.phase)} response ${index + 1}`,
          correct: Boolean(response.correct),
          misconceptionTag:
            typeof response.misconception_tag === "string"
              ? response.misconception_tag
              : null,
        })),
        reflection:
          typeof reflection.data?.reflection_note === "string"
            ? reflection.data.reflection_note
            : null,
      };
      return jsonResponse({ student }, 200, headers);
    }
    return jsonResponse({ summary }, 200, headers);
  } catch (error) {
    if (error instanceof TeacherDashboardBoundaryError) {
      return jsonResponse({ error: error.code }, error.status, headers);
    }
    const status = error instanceof RequestOriginError
      ? error.status
      : error instanceof TypeError || error instanceof z.ZodError
        ? 400
        : 404;
    return jsonResponse(
      {
        error: status === 400
          ? "INVALID_DASHBOARD_REQUEST"
          : "COHORT_NOT_AVAILABLE",
      },
      status,
      headers,
    );
  }
});
