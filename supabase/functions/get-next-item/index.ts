import { z } from "npm:zod@4.4.3";
import { callerClient } from "../_shared/auth.ts";
import { corsHeaders, RequestOriginError } from "../_shared/cors.ts";
import { jsonResponse, readJson } from "../_shared/http.ts";
import type {
  LearningItemPayload,
} from "../../../src/shared/api/contracts.ts";

const requestSchema = z.object({
  attemptId: z.uuid(),
});

function learningError(message: string): {
  code: string;
  status: number;
} {
  if (message.includes("ASSIGNMENT_NOT_AVAILABLE")) {
    return { code: "ASSIGNMENT_NOT_AVAILABLE", status: 404 };
  }
  return { code: "LEARNING_ITEM_NOT_AVAILABLE", status: 409 };
}

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
      return jsonResponse({ error: "AUTH_REQUIRED" }, 401, headers);
    }

    const result = await client.rpc("get_next_learning_item", {
      p_attempt_id: input.attemptId,
    });
    if (result.error) {
      const mapped = learningError(result.error.message);
      return jsonResponse({ error: mapped.code }, mapped.status, headers);
    }

    return jsonResponse(
      { item: (result.data as LearningItemPayload | null) ?? null },
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
        error: status === 401 ? "AUTH_REQUIRED" : "INVALID_ITEM_REQUEST",
      },
      status,
      headers,
    );
  }
});
