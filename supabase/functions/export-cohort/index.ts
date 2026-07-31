import { z } from "npm:zod@4.4.3";
import { callerClient } from "../_shared/auth.ts";
import { corsHeaders, RequestOriginError } from "../_shared/cors.ts";
import {
  ExportBoundaryError,
  loadOwnedExport,
  type CohortExportType,
  type ExportRepository,
} from "../_shared/export-core.ts";
import { readJson } from "../_shared/http.ts";
import {
  dashboardSummaryCsv,
  teacherPrivateCsv,
  type TeacherPrivateExportRow,
} from "../../../src/teacher/export/csv.ts";
import type {
  TeacherDashboardSummary,
} from "../../../src/shared/api/contracts.ts";

const schema = z.object({
  cohortId: z.uuid(),
  exportType: z.enum(["summary", "teacher-private"]),
});

type ExportPayload =
  | { type: "summary"; summary: TeacherDashboardSummary }
  | { type: "teacher-private"; rows: TeacherPrivateExportRow[] };

Deno.serve(async (request) => {
  let headers: Record<string, string> = {};
  try {
    headers = corsHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "METHOD_NOT_ALLOWED" }),
        { status: 405, headers },
      );
    }
    const input = schema.parse(await readJson(request));
    const client = callerClient(request);
    const user = await client.auth.getUser();

    const repository: ExportRepository<ExportPayload> = {
      async loadOwnedRows(_actorUserId, cohortId, exportType) {
        const authorized = await client.rpc(
          "get_teacher_dashboard_summary",
          { p_cohort_id: cohortId },
        );
        if (authorized.error) return null;
        if (exportType === "summary") {
          return {
            type: "summary",
            summary: authorized.data as TeacherDashboardSummary,
          };
        }

        const [profiles, publicProfiles, groups, results] =
          await Promise.all([
            client
              .from("student_private_profiles")
              .select("student_id,real_name,group_id")
              .eq("cohort_id", cohortId),
            client
              .from("student_public_profiles")
              .select("student_id,nickname")
              .eq("cohort_id", cohortId),
            client
              .from("groups")
              .select("id,display_name")
              .eq("cohort_id", cohortId),
            client
              .from("quest_results")
              .select("student_id")
              .eq("cohort_id", cohortId),
          ]);
        if (
          profiles.error ||
          publicProfiles.error ||
          groups.error ||
          results.error
        ) {
          return null;
        }
        const nicknames = new Map(
          (publicProfiles.data ?? []).map((row) => [
            String(row.student_id),
            String(row.nickname),
          ]),
        );
        const groupNames = new Map(
          (groups.data ?? []).map((row) => [
            String(row.id),
            String(row.display_name),
          ]),
        );
        const completedStudentIds = new Set(
          (results.data ?? []).map((row) => String(row.student_id)),
        );
        const rows = (profiles.data ?? []).map((row) => {
          const studentId = String(row.student_id);
          return {
            realName: String(row.real_name),
            nickname: nicknames.get(studentId) ?? "",
            groupName: groupNames.get(String(row.group_id)) ?? "",
            completed: completedStudentIds.has(studentId),
          };
        });
        return { type: "teacher-private", rows };
      },
    };

    const payload = await loadOwnedExport(
      user.data.user?.id ?? null,
      input.cohortId,
      input.exportType as CohortExportType,
      repository,
    );
    const csv = payload.type === "summary"
      ? dashboardSummaryCsv(payload.summary)
      : teacherPrivateCsv(new Date().toISOString(), payload.rows);
    return new Response(csv, {
      status: 200,
      headers: {
        ...headers,
        "Cache-Control": "private, no-store",
        "Content-Disposition":
          `attachment; filename="cohort-${input.exportType}.csv"`,
        "Content-Type": "text/csv; charset=utf-8",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const status = error instanceof RequestOriginError
      ? error.status
      : error instanceof z.ZodError || error instanceof TypeError
        ? 400
        : 404;
    return new Response(
      JSON.stringify({
        error: error instanceof ExportBoundaryError
          ? error.code
          : status === 400
            ? "INVALID_EXPORT_REQUEST"
            : "EXPORT_NOT_AVAILABLE",
      }),
      {
        status,
        headers: {
          ...headers,
          "Cache-Control": "private, no-store",
          "Content-Type": "application/json; charset=utf-8",
        },
      },
    );
  }
});
