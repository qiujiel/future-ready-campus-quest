import { z } from "npm:zod@4.4.3";
import {
  adminClient,
  callerClient,
  frontendAppUrl,
  issueSessionForExistingUser,
  publicAuthClient,
} from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { RequestOriginError } from "../_shared/cors.ts";
import {
  createRecoveryToken,
  type RecoveryDependencies,
  RecoveryBoundaryError,
  recoverStudent,
} from "../_shared/recovery-core.ts";
import { jsonResponse, readJson } from "../_shared/http.ts";

const issueSchema = z.object({
  action: z.literal("issue"),
  cohortId: z.uuid(),
  studentId: z.uuid(),
  requestKey: z.uuid(),
});

const redeemSchema = z.object({
  action: z.literal("redeem"),
  recoveryToken: z.string().min(20).max(512),
  requestKey: z.uuid(),
});

function mapRecoveryError(message: string): never {
  if (message.includes("RECOVERY_LINK_USED")) {
    throw new RecoveryBoundaryError("RECOVERY_LINK_USED", 410);
  }
  if (message.includes("RECOVERY_LINK_EXPIRED")) {
    throw new RecoveryBoundaryError("RECOVERY_LINK_EXPIRED", 410);
  }
  if (message.includes("RECOVERY_SCOPE_REJECTED")) {
    throw new RecoveryBoundaryError("RECOVERY_SCOPE_REJECTED", 403);
  }
  throw new RecoveryBoundaryError("RECOVERY_NOT_AVAILABLE", 409);
}

Deno.serve(async (request) => {
  let headers: Record<string, string> = {};
  let actorId: string | undefined;
  let rejectedRequest:
    | { cohortId: string; studentId: string; requestKey: string }
    | undefined;
  let redeemRequestKey: string | undefined;
  try {
    headers = corsHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "POST") {
      return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405, headers);
    }

    const body = await readJson(request);
    const issue = issueSchema.safeParse(body);
    if (issue.success) {
      rejectedRequest = issue.data;
      const client = callerClient(request);
      const user = await client.auth.getUser();
      actorId = user.data.user?.id;
      if (user.error || !actorId) {
        return jsonResponse({ error: "AUTH_REQUIRED" }, 401, headers);
      }

      const secret = Deno.env.get("RECOVERY_TOKEN_SIGNING_SECRET");
      if (!secret || secret.length < 32) {
        throw new Error("Recovery signing is not configured.");
      }
      const token = await createRecoveryToken(
        issue.data.requestKey,
        secret,
      );
      const result = await client.rpc("issue_student_recovery", {
        p_cohort_id: issue.data.cohortId,
        p_student_id: issue.data.studentId,
        p_token_hash: token.tokenHash,
        p_expires_at: token.expiresAt,
        p_request_key: issue.data.requestKey,
      });
      if (result.error) mapRecoveryError(result.error.message);
      const row = result.data?.[0] as { expires_at?: string } | undefined;
      return jsonResponse(
        {
          recoveryUrl: `${frontendAppUrl()}/#/recover/${token.rawToken}`,
          expiresAt: row?.expires_at ?? token.expiresAt,
        },
        200,
        headers,
      );
    }

    const redeem = redeemSchema.parse(body);
    redeemRequestKey = redeem.requestKey;
    const admin = adminClient();
    const publicClient = publicAuthClient();
    const dependencies: RecoveryDependencies = {
      async claimToken(tokenHash, requestKey) {
        const result = await admin.rpc("claim_student_recovery", {
          p_token_hash: tokenHash,
          p_request_key: requestKey,
        });
        if (result.error) mapRecoveryError(result.error.message);
        const row = result.data?.[0] as { student_id?: string } | undefined;
        if (!row?.student_id) {
          throw new RecoveryBoundaryError("RECOVERY_NOT_AVAILABLE", 409);
        }
        return { studentId: row.student_id };
      },
      async issueSession(studentId) {
        return issueSessionForExistingUser(admin, publicClient, studentId);
      },
      async finalizeToken(tokenHash, requestKey) {
        const result = await admin.rpc("finalize_student_recovery", {
          p_token_hash: tokenHash,
          p_request_key: requestKey,
        });
        if (result.error) mapRecoveryError(result.error.message);
      },
    };
    const recovered = await recoverStudent(
      {
        recoveryToken: redeem.recoveryToken,
        requestKey: redeem.requestKey,
      },
      dependencies,
    );
    return jsonResponse(recovered, 200, headers);
  } catch (error) {
    if (actorId && rejectedRequest) {
      try {
        await adminClient().rpc("record_rejected_security_action", {
          p_actor_user_id: actorId,
          p_cohort_id: rejectedRequest.cohortId,
          p_event_type: "recovery.issue",
          p_entity_id: rejectedRequest.studentId,
          p_request_key: rejectedRequest.requestKey,
        });
      } catch {
        // Preserve the neutral client error even if audit storage is unavailable.
      }
    } else if (redeemRequestKey) {
      try {
        await adminClient().rpc("record_rejected_security_action", {
          p_actor_user_id: null,
          p_cohort_id: null,
          p_event_type: "recovery.redeem",
          p_entity_id: null,
          p_request_key: redeemRequestKey,
        });
      } catch {
        // Preserve the neutral client error even if audit storage is unavailable.
      }
    }
    const status =
      error instanceof RecoveryBoundaryError || error instanceof RequestOriginError
        ? error.status
        : 400;
    return jsonResponse(
      {
        error:
          error instanceof RecoveryBoundaryError
            ? error.code
            : "INVALID_RECOVERY_REQUEST",
      },
      status,
      headers,
    );
  }
});
