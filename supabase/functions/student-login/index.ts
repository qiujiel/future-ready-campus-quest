import type { SupabaseClient } from "npm:@supabase/supabase-js@2.111.0";
import {
  adminClient,
  issueSessionForExistingUser,
  publicAuthClient,
} from "../_shared/auth.ts";
import { trustedClientAddress } from "../_shared/client-address.ts";
import { corsHeaders, RequestOriginError } from "../_shared/cors.ts";
import { jsonResponse, readJson } from "../_shared/http.ts";
import {
  loginStudent,
  type StudentLoginCandidate,
  type StudentLoginDependencies,
  StudentLoginBoundaryError,
} from "../_shared/student-login-core.ts";
import {
  deriveStudentNameLookupHash,
  normalizeStudentName,
  STUDENT_PASSCODE_ITERATIONS,
  type StoredPasscode,
  verifyStudentPasscode,
} from "../_shared/student-credentials-core.ts";
import type {
  StudentIdentity,
  StudentLoginInput,
} from "../../../src/shared/api/contracts.ts";

const dummyCredential: StoredPasscode = {
  salt: "AAAAAAAAAAAAAAAAAAAAAA",
  hash: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  iterations: STUDENT_PASSCODE_ITERATIONS,
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function deriveRateKeyHash(
  clientAddress: string,
  signingSecret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`student-login-network\0${clientAddress}`),
  );
  return bytesToHex(new Uint8Array(signature));
}

function neutralFailure(): StudentLoginBoundaryError {
  return new StudentLoginBoundaryError("STUDENT_LOGIN_NOT_ACCEPTED", 401);
}

function mapLoginRpcError(message: string): never {
  if (message.includes("LOGIN_NOT_AVAILABLE")) {
    throw new StudentLoginBoundaryError("LOGIN_NOT_AVAILABLE", 429);
  }
  throw neutralFailure();
}

function asCandidate(row: Record<string, unknown>): StudentLoginCandidate | null {
  if (row.student_id == null) return null;
  if (
    typeof row.student_id !== "string" ||
    typeof row.passcode_salt !== "string" ||
    typeof row.passcode_hash !== "string" ||
    typeof row.passcode_iterations !== "number"
  ) {
    throw neutralFailure();
  }
  return {
    studentId: row.student_id,
    credential: {
      salt: row.passcode_salt,
      hash: row.passcode_hash,
      iterations: row.passcode_iterations,
    },
  };
}

async function loadStudentIdentity(
  admin: SupabaseClient,
  studentId: string,
): Promise<StudentIdentity> {
  const result = await admin.rpc("load_student_login_identity", {
    p_student_id: studentId,
  });
  const rows = Array.isArray(result.data)
    ? result.data as Record<string, unknown>[]
    : [];
  const row = rows[0];
  if (
    result.error ||
    rows.length !== 1 ||
    !row ||
    row.student_id !== studentId ||
    typeof row.cohort_id !== "string" ||
    typeof row.group_id !== "string" ||
    typeof row.group_number !== "number" ||
    typeof row.nickname !== "string" ||
    typeof row.is_group_identity_editor !== "boolean"
  ) {
    throw neutralFailure();
  }

  return {
    studentId,
    cohortId: row.cohort_id,
    groupId: row.group_id,
    groupNumber: row.group_number,
    nickname: row.nickname,
    isGroupIdentityEditor: row.is_group_identity_editor,
  };
}

function dependencies(
  admin: SupabaseClient,
  publicClient: SupabaseClient,
  signingSecret: string,
  rateKeyHash: string,
): StudentLoginDependencies {
  return {
    async beginAttempt(classAccessId, normalizedName, requestKey) {
      const nameLookupHash = await deriveStudentNameLookupHash(
        classAccessId,
        normalizeStudentName(normalizedName),
        signingSecret,
      );
      const result = await admin.rpc("begin_student_login", {
        p_student_access_id: classAccessId,
        p_name_lookup_hash: nameLookupHash,
        p_rate_key_hash: rateKeyHash,
        p_request_key: requestKey,
      });
      if (result.error) mapLoginRpcError(result.error.message);
      const rows = Array.isArray(result.data)
        ? result.data as Record<string, unknown>[]
        : [];
      const attemptId = rows[0]?.attempt_id;
      if (typeof attemptId !== "string") throw neutralFailure();
      return {
        attemptId,
        candidates: rows.map(asCandidate).filter(
          (candidate): candidate is StudentLoginCandidate => candidate !== null,
        ).slice(0, 4),
      };
    },
    verifyPasscode: verifyStudentPasscode,
    dummyCredential,
    async finishAttempt(attemptId, succeeded, studentId) {
      const result = await admin.rpc("finish_student_login", {
        p_attempt_id: attemptId,
        p_student_id: studentId ?? null,
        p_succeeded: succeeded,
      });
      if (result.error) mapLoginRpcError(result.error.message);
    },
    loadIdentity(studentId) {
      return loadStudentIdentity(admin, studentId);
    },
    issueSession(studentId) {
      return issueSessionForExistingUser(admin, publicClient, studentId);
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

    const signingSecret = Deno.env.get("STUDENT_LOGIN_SIGNING_SECRET");
    if (!signingSecret || signingSecret.length < 32) {
      throw new Error("Student login signing is not configured.");
    }
    const clientAddress = trustedClientAddress(request.headers);
    const result = await loginStudent(
      await readJson(request) as StudentLoginInput,
      dependencies(
        adminClient(),
        publicAuthClient(),
        signingSecret,
        await deriveRateKeyHash(clientAddress, signingSecret),
      ),
    );
    return jsonResponse(result, 200, headers);
  } catch (error) {
    const boundaryError = error instanceof StudentLoginBoundaryError
      ? error
      : null;
    const status = boundaryError?.status ??
      (error instanceof RequestOriginError ? error.status : 400);
    return jsonResponse(
      { error: boundaryError?.code ?? "INVALID_REQUEST" },
      status,
      headers,
    );
  }
});
