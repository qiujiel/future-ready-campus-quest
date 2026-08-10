import { z } from "npm:zod@4.4.3";
import { callerClient, frontendAppUrl } from "../_shared/auth.ts";
import { corsHeaders, RequestOriginError } from "../_shared/cors.ts";
import {
  createEdgeRecoveryToken,
  deriveEdgeToken,
  hashEdgeToken,
} from "../_shared/edge-token.ts";
import { createGroupJoinCodes } from "../_shared/join-core.ts";
import {
  normalizeTeacherControl,
  TeacherControlBoundaryError,
} from "../_shared/teacher-controls-core.ts";
import { jsonResponse, readJson } from "../_shared/http.ts";
import {
  buildStudentClassUrl,
  loadTeacherStudentAccessId,
} from "../_shared/teacher-class-access.ts";
import type {
  TeacherControlCommand,
} from "../../../src/shared/api/contracts.ts";

const base = { cohortId: z.uuid(), requestKey: z.uuid() };
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("open-join"), ...base }),
  z.object({ action: z.literal("close-join"), ...base }),
  z.object({ action: z.literal("launch-quest"), ...base }),
  z.object({
    action: z.literal("set-group-join"),
    ...base,
    groupId: z.uuid(),
    enabled: z.boolean(),
  }),
  z.object({
    action: z.literal("move-student"),
    ...base,
    studentId: z.uuid(),
    groupId: z.uuid(),
  }),
  z.object({
    action: z.enum(["remove-student", "reset-student"]),
    ...base,
    studentId: z.uuid(),
  }),
  z.object({
    action: z.literal("issue-recovery"),
    ...base,
    studentId: z.uuid(),
  }),
  z.object({
    action: z.literal("transfer-editor"),
    ...base,
    groupId: z.uuid(),
    studentId: z.uuid(),
  }),
  z.object({
    action: z.literal("set-group-lock"),
    ...base,
    groupId: z.uuid(),
    locked: z.boolean(),
  }),
  z.object({
    action: z.literal("set-quest-starts"),
    ...base,
    allowed: z.boolean(),
  }),
  z.object({
    action: z.literal("extend-phase"),
    ...base,
    phase: z.enum([
      "diagnostic",
      "mission",
      "final",
      "retry",
      "reflection",
    ]),
    seconds: z.number().int().min(1).max(300),
  }),
  z.object({ action: z.literal("close-session"), ...base }),
]);

Deno.serve(async (request) => {
  let headers: Record<string, string> = {};
  try {
    headers = corsHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "POST") {
      return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405, headers);
    }
    const input = schema.parse(await readJson(request));
    normalizeTeacherControl(input as TeacherControlCommand);
    const client = callerClient(request);
    const user = await client.auth.getUser();
    if (user.error || !user.data.user) {
      throw new TeacherControlBoundaryError("CONTROL_NOT_AVAILABLE", 404);
    }
    if (
      input.action === "move-student" ||
      input.action === "remove-student" ||
      input.action === "reset-student"
    ) {
      const result = await client.rpc("manage_teacher_roster", {
        p_cohort_id: input.cohortId,
        p_action: input.action,
        p_student_id: input.studentId,
        p_target_group_id: input.action === "move-student"
          ? input.groupId
          : null,
        p_request_key: input.requestKey,
      });
      if (result.error) throw new Error("CONTROL_NOT_AVAILABLE");
      return jsonResponse(result.data, 200, headers);
    }
    const groupId = "groupId" in input ? input.groupId : null;
    const studentId = "studentId" in input ? input.studentId : null;
    const scope = await client.rpc("assert_teacher_control_scope", {
      p_cohort_id: input.cohortId,
      p_group_id: groupId,
      p_student_id: studentId,
    });
    if (scope.error || scope.data !== true) {
      throw new TeacherControlBoundaryError("CONTROL_NOT_AVAILABLE", 404);
    }

    if (input.action === "open-join") {
      const secret = Deno.env.get("JOIN_TOKEN_SIGNING_SECRET");
      if (!secret || secret.length < 32) throw new Error("CONFIGURATION");
      const rawToken = await deriveEdgeToken(input.requestKey, secret);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const result = await client.rpc("open_cohort_join_window", {
        p_cohort_id: input.cohortId,
        p_token_hash: await hashEdgeToken(rawToken),
        p_expires_at: expiresAt,
        p_request_key: input.requestKey,
      });
      if (result.error) throw new Error("CONTROL_NOT_AVAILABLE");
      const joinWindowId = typeof result.data?.id === "string"
        ? result.data.id
        : "";
      const groups = await client
        .from("groups")
        .select("id,group_number")
        .eq("cohort_id", input.cohortId)
        .order("group_number");
      if (!joinWindowId || groups.error || !groups.data) {
        throw new Error("CONTROL_NOT_AVAILABLE");
      }
      const generated = await createGroupJoinCodes(
        groups.data.map((group) => ({
          groupId: String(group.id),
          groupNumber: Number(group.group_number),
        })),
        input.requestKey,
        secret,
      );
      const configured = await client.rpc("configure_cohort_group_join_codes", {
        p_cohort_id: input.cohortId,
        p_join_window_id: joinWindowId,
        p_codes: generated.persistence,
      });
      if (configured.error || configured.data !== true) {
        throw new Error("CONTROL_NOT_AVAILABLE");
      }
      const studentAccessId = await loadTeacherStudentAccessId(
        client,
        input.cohortId,
      );
      const studentUrl = buildStudentClassUrl(
        frontendAppUrl(),
        studentAccessId,
      );
      return jsonResponse({
        affected: 0,
        actionState: "open",
        expiresAt,
        joinUrl: studentUrl,
        studentUrl,
        groups: generated.receipts,
      }, 200, headers);
    }

    if (input.action === "close-join") {
      const result = await client.rpc("close_cohort_join_window", {
        p_cohort_id: input.cohortId,
        p_request_key: input.requestKey,
      });
      if (result.error) throw new Error("CONTROL_NOT_AVAILABLE");
      return jsonResponse({ affected: 0, actionState: "closed" }, 200, headers);
    }

    if (input.action === "set-group-join") {
      const result = await client.rpc("set_group_join_code_enabled", {
        p_cohort_id: input.cohortId,
        p_group_id: input.groupId,
        p_enabled: input.enabled,
        p_request_key: input.requestKey,
      });
      if (result.error || result.data !== true) {
        throw new Error("CONTROL_NOT_AVAILABLE");
      }
      return jsonResponse({
        affected: 1,
        actionState: input.enabled ? "enabled" : "disabled",
      }, 200, headers);
    }

    if (input.action === "launch-quest") {
      const result = await client.rpc("launch_cohort_quest", {
        p_cohort_id: input.cohortId,
        p_request_key: input.requestKey,
      });
      if (result.error) throw new Error("CONTROL_NOT_AVAILABLE");
      return jsonResponse(result.data, 200, headers);
    }

    if (input.action === "issue-recovery") {
      const secret = Deno.env.get("RECOVERY_TOKEN_SIGNING_SECRET");
      if (!secret || secret.length < 32) throw new Error("CONFIGURATION");
      const token = await createEdgeRecoveryToken(input.requestKey, secret);
      const result = await client.rpc("issue_student_recovery", {
        p_cohort_id: input.cohortId,
        p_student_id: input.studentId,
        p_token_hash: token.tokenHash,
        p_expires_at: token.expiresAt,
        p_request_key: input.requestKey,
      });
      if (result.error) throw new Error("CONTROL_NOT_AVAILABLE");
      return jsonResponse({
        affected: 1,
        expiresAt: token.expiresAt,
        recoveryUrl: `${frontendAppUrl()}/#/recover/${token.rawToken}`,
      }, 200, headers);
    }

    if (
      input.action === "transfer-editor" ||
      input.action === "set-group-lock"
    ) {
      const result = await client.rpc("manage_group_identity", {
        p_action: input.action === "transfer-editor"
          ? "transfer-editor"
          : input.locked ? "lock" : "unlock",
        p_group_id: input.groupId,
        p_display_name: null,
        p_next_editor_id: input.action === "transfer-editor"
          ? input.studentId
          : null,
        p_request_key: input.requestKey,
      });
      if (result.error) throw new Error("CONTROL_NOT_AVAILABLE");
      return jsonResponse({ affected: 1, actionState: "applied" }, 200, headers);
    }

    if (input.action === "close-session") {
      const result = await client.rpc("close_teacher_session", {
        p_cohort_id: input.cohortId,
        p_request_key: input.requestKey,
      });
      if (result.error) throw new Error("CONTROL_NOT_AVAILABLE");
      return jsonResponse(result.data, 200, headers);
    }
    const result = await client.rpc("apply_teacher_control", {
      p_cohort_id: input.cohortId,
      p_action: input.action,
      p_phase: input.action === "extend-phase" ? input.phase : null,
      p_seconds: input.action === "extend-phase" ? input.seconds : null,
      p_allowed: input.action === "set-quest-starts"
        ? input.allowed
        : null,
      p_request_key: input.requestKey,
    });
    if (result.error) throw new Error("CONTROL_NOT_AVAILABLE");
    return jsonResponse(result.data, 200, headers);
  } catch (error) {
    const status = error instanceof RequestOriginError
      ? error.status
      : error instanceof z.ZodError ||
          error instanceof TypeError ||
          (
            error instanceof TeacherControlBoundaryError &&
            error.status === 400
          )
        ? 400
        : 404;
    return jsonResponse(
      {
        error: status === 400
          ? "INVALID_CONTROL"
          : "CONTROL_NOT_AVAILABLE",
      },
      status,
      headers,
    );
  }
});
