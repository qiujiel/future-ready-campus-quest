import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { adminClient, publicAuthClient } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  type CompleteJoinInput,
  type JoinDependencies,
  JoinBoundaryError,
  joinStudent,
  type StoredJoin,
  type SyntheticUser,
} from "../_shared/join-core.ts";
import { jsonResponse, readJson } from "../_shared/http.ts";
import type {
  JoinCohortInput,
  SessionTokens,
  StudentIdentity,
} from "../../../src/shared/api/contracts.ts";

function randomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

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

function sessionTokens(
  session: { access_token: string; refresh_token: string } | null,
): SessionTokens {
  if (!session) throw new Error("SESSION_NOT_CREATED");
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  };
}

function safeRpcError(error: { message: string }): never {
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
): JoinDependencies {
  return {
    async findCompletedJoin(tokenHash, requestKey): Promise<StoredJoin | null> {
      const result = await admin.rpc("find_completed_student_join", {
        p_token_hash: tokenHash,
        p_request_key: requestKey,
      });
      if (result.error) safeRpcError(result.error);
      const row = result.data?.[0] as Record<string, unknown> | undefined;
      return row ? { identity: mapIdentity(row) } : null;
    },
    async createSyntheticUser(): Promise<SyntheticUser> {
      const password = randomPassword();
      const internalEmail = `${crypto.randomUUID()}@students.invalid`;
      const result = await admin.auth.admin.createUser({
        email: internalEmail,
        password,
        email_confirm: true,
        app_metadata: { role: "student" },
      });
      if (result.error || !result.data.user) throw new Error("AUTH_CREATE_FAILED");
      return {
        studentId: result.data.user.id,
        internalEmail,
        password,
      };
    },
    async signInNewUser(user): Promise<SessionTokens> {
      const result = await publicClient.auth.signInWithPassword({
        email: user.internalEmail,
        password: user.password,
      });
      if (result.error) throw new Error("AUTH_SESSION_FAILED");
      return sessionTokens(result.data.session);
    },
    async issueReplacementSession(studentId): Promise<SessionTokens> {
      const user = await admin.auth.admin.getUserById(studentId);
      const email = user.data.user?.email;
      if (user.error || !email) throw new Error("AUTH_USER_NOT_FOUND");
      const link = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      const tokenHash = link.data.properties?.hashed_token;
      if (link.error || !tokenHash) throw new Error("AUTH_LINK_FAILED");
      const verified = await publicClient.auth.verifyOtp({
        token_hash: tokenHash,
        type: "email",
      });
      if (verified.error) throw new Error("AUTH_SESSION_FAILED");
      return sessionTokens(verified.data.session);
    },
    async completeJoin(input: CompleteJoinInput): Promise<StudentIdentity> {
      const result = await admin.rpc("complete_student_join", {
        p_token_hash: input.tokenHash,
        p_request_key: input.requestKey,
        p_student_id: input.studentId,
        p_group_number: input.groupNumber,
        p_real_name: input.realName,
        p_nickname: input.nickname ?? null,
      });
      if (result.error) safeRpcError(result.error);
      const row = result.data?.[0] as Record<string, unknown> | undefined;
      if (!row) throw new Error("JOIN_RESULT_MISSING");
      return mapIdentity(row);
    },
    async deleteSyntheticUser(studentId): Promise<void> {
      await admin.auth.admin.deleteUser(studentId, false);
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
    const result = await joinStudent(
      input,
      dependencies(adminClient(), publicAuthClient()),
    );
    return jsonResponse(result, 200, headers);
  } catch (error) {
    const status = error instanceof JoinBoundaryError ? error.status : 400;
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
