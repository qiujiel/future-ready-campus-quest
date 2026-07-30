import { z } from "npm:zod@4.4.3";
import { callerClient } from "../_shared/auth.ts";
import { corsHeaders, RequestOriginError } from "../_shared/cors.ts";
import { jsonResponse, readJson } from "../_shared/http.ts";
import type {
  ResponseResult,
  ResponseSubmission,
} from "../../../src/shared/api/contracts.ts";

const responseSchema = z.object({
  attemptId: z.uuid(),
  assignmentId: z.uuid(),
  idempotencyKey: z.uuid(),
  selectedOptionIds: z.array(z.string().trim().min(1)).min(1),
  clientSequence: z.number().int().positive(),
  confidence: z
    .enum(["unsure", "somewhat_sure", "very_sure"])
    .optional(),
});

function learningError(message: string): {
  code: string;
  status: number;
} {
  if (message.includes("STALE_SEQUENCE")) {
    return { code: "STALE_SEQUENCE", status: 409 };
  }
  if (message.includes("ASSIGNMENT_NOT_AVAILABLE")) {
    return { code: "ASSIGNMENT_NOT_AVAILABLE", status: 404 };
  }
  if (message.includes("INVALID_RESPONSE")) {
    return { code: "INVALID_RESPONSE", status: 400 };
  }
  return { code: "RESPONSE_NOT_ACCEPTED", status: 409 };
}

Deno.serve(async (request) => {
  let headers: Record<string, string> = {};
  try {
    headers = corsHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "POST") {
      return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405, headers);
    }

    const input = responseSchema.parse(
      await readJson(request),
    ) as ResponseSubmission;
    const client = callerClient(request);
    const user = await client.auth.getUser();
    if (user.error || !user.data.user) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, 401, headers);
    }

    const result = await client.rpc("submit_learning_response", {
      p_attempt_id: input.attemptId,
      p_assignment_id: input.assignmentId,
      p_idempotency_key: input.idempotencyKey,
      p_selected_option_ids: input.selectedOptionIds,
      p_client_sequence: input.clientSequence,
      p_confidence: input.confidence ?? null,
    });
    if (result.error) {
      const mapped = learningError(result.error.message);
      return jsonResponse({ error: mapped.code }, mapped.status, headers);
    }

    return jsonResponse(
      { result: result.data as ResponseResult },
      200,
      headers,
    );
  } catch (error) {
    const status = error instanceof RequestOriginError
      ? error.status
      : error instanceof TypeError || error instanceof z.ZodError
        ? 400
        : 401;
    return jsonResponse(
      {
        error: status === 401 ? "AUTH_REQUIRED" : "INVALID_RESPONSE",
      },
      status,
      headers,
    );
  }
});
