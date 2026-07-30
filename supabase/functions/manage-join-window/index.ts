import { z } from "npm:zod@4";
import { callerClient, frontendOrigin } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  deriveJoinToken,
  hashJoinToken,
  JoinBoundaryError,
} from "../_shared/join-core.ts";
import { jsonResponse, readJson } from "../_shared/http.ts";

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create-cohort"),
    title: z.string().trim().min(2).max(100),
    groupCount: z.number().int().min(1).max(20),
    groupCapacity: z.number().int().min(1).max(20),
    requestKey: z.uuid(),
  }),
  z.object({
    action: z.literal("open"),
    cohortId: z.uuid(),
    requestKey: z.uuid(),
  }),
  z.object({
    action: z.literal("close"),
    cohortId: z.uuid(),
    requestKey: z.uuid(),
  }),
]);

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
    const userResult = await client.auth.getUser();
    if (userResult.error || !userResult.data.user) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, 401, headers);
    }

    if (input.action === "create-cohort") {
      const result = await client.rpc("create_teacher_cohort", {
        p_title: input.title,
        p_group_count: input.groupCount,
        p_group_capacity: input.groupCapacity,
        p_request_key: input.requestKey,
      });
      if (result.error) throw result.error;
      return jsonResponse({ cohort: result.data }, 200, headers);
    }

    if (input.action === "close") {
      const result = await client.rpc("close_cohort_join_window", {
        p_cohort_id: input.cohortId,
        p_request_key: input.requestKey,
      });
      if (result.error) throw result.error;
      return jsonResponse({ closed: true }, 200, headers);
    }

    const signingSecret = Deno.env.get("JOIN_TOKEN_SIGNING_SECRET");
    if (!signingSecret || signingSecret.length < 32) {
      throw new Error("JOIN_TOKEN_SIGNING_SECRET is not configured.");
    }
    const rawToken = await deriveJoinToken(input.requestKey, signingSecret);
    const tokenHash = await hashJoinToken(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const result = await client.rpc("open_cohort_join_window", {
      p_cohort_id: input.cohortId,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt,
      p_request_key: input.requestKey,
    });
    if (result.error) throw result.error;

    const persistedExpiry =
      typeof result.data?.expires_at === "string"
        ? result.data.expires_at
        : expiresAt;
    return jsonResponse(
      {
        joinUrl: `${frontendOrigin()}/#/join/${rawToken}`,
        expiresAt: persistedExpiry,
      },
      200,
      headers,
    );
  } catch (error) {
    const status = error instanceof JoinBoundaryError ? error.status : 400;
    return jsonResponse(
      {
        error:
          error instanceof JoinBoundaryError
            ? error.code
            : "JOIN_WINDOW_REQUEST_REJECTED",
      },
      status,
      headers,
    );
  }
});
