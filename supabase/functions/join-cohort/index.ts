import type { SupabaseClient } from "npm:@supabase/supabase-js@2.111.0";
import {
  adminClient,
  issueSessionForExistingUser,
  publicAuthClient,
} from "../_shared/auth.ts";
import {
  createInitialStudentIdentity,
  exchangeInitialStudentSession,
} from "../_shared/session-core.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  type CompleteJoinInput,
  hashJoinToken,
  type JoinDependencies,
  JoinBoundaryError,
  joinStudent,
  type StoredJoin,
  type SyntheticUser,
} from "../_shared/join-core.ts";
import { RequestOriginError } from "../_shared/cors.ts";
import { jsonResponse, readJson } from "../_shared/http.ts";
import type {
  JoinCohortInput,
  SessionTokens,
  StudentIdentity,
} from "../../../src/shared/api/contracts.ts";

function mapIdentity(row: Record<string, unknown>): StudentIdentity {
  return {
    studentId: String(row.student_id),
    cohortId: String(row.cohort_id),
    groupId: String(row.group_id),
    groupNumber: Number(row.group_number),
    nickname: String(row.nickname),
    isGroupIdentityEditor: Boolean(row.is_group_identity_editor),
  };
}

function safeRpcError(error: { message: string }): never {
  if (error.message.includes("INVALID_JOIN_CODE")) {
    throw new JoinBoundaryError("INVALID_JOIN_CODE", 404);
  }
  if (error.message.includes("GROUP_JOIN_CLOSED")) {
    throw new JoinBoundaryError("GROUP_JOIN_CLOSED", 410);
  }
  if (error.message.includes("INACTIVE_COHORT")) {
    throw new JoinBoundaryError("INACTIVE_COHORT", 410);
  }
  if (error.message.includes("JOIN_WINDOW_CLOSED")) {
    throw new JoinBoundaryError("JOIN_WINDOW_CLOSED", 410);
  }
  if (error.message.includes("INVALID_GROUP")) {
    throw new JoinBoundaryError("INVALID_GROUP", 400);
  }
  if (error.message.includes("GROUP_FULL")) {
    throw new JoinBoundaryError("GROUP_FULL", 409);
  }
  throw new Error("JOIN_RPC_REJECTED");
}

function dependencies(
  admin: SupabaseClient,
  publicClient: SupabaseClient,
  rateKeyHash: string,
  timings: Record<string, number>,
): JoinDependencies {
  async function measured<T>(name: string, action: () => Promise<T>): Promise<T> {
    const started = performance.now();
    try {
      return await action();
    } finally {
      timings[name] = performance.now() - started;
    }
  }

  return {
    async findCompletedJoin(codeHash, requestKey): Promise<StoredJoin | null> {
      return measured("find", async () => {
        const result = await admin.rpc("find_completed_student_code_join", {
          p_code_hash: codeHash,
          p_request_key: requestKey,
        });
        if (result.error) safeRpcError(result.error);
        const row = result.data?.[0] as Record<string, unknown> | undefined;
        return row ? { identity: mapIdentity(row) } : null;
      });
    },
    async preflightJoin(codeHash) {
      return measured("preflight", async () => {
        const result = await admin.rpc("preflight_student_code_join", {
          p_code_hash: codeHash,
          p_rate_key_hash: rateKeyHash,
        });
        if (result.error) safeRpcError(result.error);
        return { groupNumber: Number(result.data) };
      });
    },
    async createSyntheticUser(): Promise<SyntheticUser> {
      return measured("create", async () => {
        const internalEmail = `${crypto.randomUUID()}@students.invalid`;
        return createInitialStudentIdentity(admin, internalEmail);
      });
    },
    async signInNewUser(user): Promise<SessionTokens> {
      return measured(
        "sign",
        () => exchangeInitialStudentSession(
          publicClient,
          user.initialTokenHash,
        ),
      );
    },
    async issueReplacementSession(studentId): Promise<SessionTokens> {
      return issueSessionForExistingUser(admin, publicClient, studentId);
    },
    async completeJoin(input: CompleteJoinInput): Promise<StudentIdentity> {
      return measured("complete", async () => {
        const result = await admin.rpc("complete_student_code_join", {
          p_code_hash: input.codeHash,
          p_request_key: input.requestKey,
          p_student_id: input.studentId,
          p_display_name: input.displayName,
        });
        if (result.error) safeRpcError(result.error);
        const row = result.data?.[0] as Record<string, unknown> | undefined;
        if (!row) throw new Error("JOIN_RESULT_MISSING");
        return mapIdentity(row);
      });
    },
    async deleteSyntheticUser(studentId): Promise<void> {
      const result = await admin.auth.admin.deleteUser(studentId, false);
      if (result.error) throw new Error("AUTH_CLEANUP_FAILED");
    },
    async recordOrphanedIdentity(studentId): Promise<void> {
      const result = await admin.rpc("record_rejected_security_action", {
        p_actor_user_id: null,
        p_cohort_id: null,
        p_event_type: "join.orphan_cleanup_failed",
        p_entity_id: studentId,
        p_request_key: crypto.randomUUID(),
      });
      if (result.error) throw new Error("AUDIT_WRITE_FAILED");
    },
  };
}

Deno.serve(async (request) => {
  let headers: Record<string, string> = {};
  try {
    headers = corsHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "POST") {
      return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405, headers);
    }

    const input = (await readJson(request)) as JoinCohortInput;
    const rateSecret = Deno.env.get("JOIN_TOKEN_SIGNING_SECRET");
    if (!rateSecret || rateSecret.length < 32) {
      throw new Error("Join signing is not configured.");
    }
    const clientAddress =
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-real-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const rateKeyHash = await hashJoinToken(`${rateSecret}\0${clientAddress}`);
    const timings: Record<string, number> = {};
    const result = await joinStudent(
      input,
      dependencies(adminClient(), publicAuthClient(), rateKeyHash, timings),
    );
    if (Deno.env.get("FRONTEND_APP_URL")?.includes("127.0.0.1")) {
      headers["Server-Timing"] = Object.entries(timings)
        .map(([name, duration]) => `${name};dur=${duration.toFixed(3)}`)
        .join(", ");
    }
    return jsonResponse(result, 200, headers);
  } catch (error) {
    const status =
      error instanceof JoinBoundaryError || error instanceof RequestOriginError
        ? error.status
        : 400;
    return jsonResponse(
      {
        error:
          error instanceof JoinBoundaryError ? error.code : "INVALID_REQUEST",
      },
      status,
      headers,
    );
  }
});
