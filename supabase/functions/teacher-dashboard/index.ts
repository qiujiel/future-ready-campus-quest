import { z } from "npm:zod@4.4.3";
import { callerClient } from "../_shared/auth.ts";
import { corsHeaders, RequestOriginError } from "../_shared/cors.ts";
import { jsonResponse, readJson } from "../_shared/http.ts";
import {
  loadTeacherDashboard,
  TeacherDashboardBoundaryError,
  type TeacherDashboardRepository,
} from "../_shared/teacher-dashboard-core.ts";
import type {
  TeacherDashboardSummary,
} from "../../../src/shared/api/contracts.ts";

const requestSchema = z.object({
  cohortId: z.uuid(),
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
