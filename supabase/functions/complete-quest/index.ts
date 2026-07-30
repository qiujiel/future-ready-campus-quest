import { z } from "npm:zod@4.4.3";
import { callerClient } from "../_shared/auth.ts";
import { corsHeaders, RequestOriginError } from "../_shared/cors.ts";
import { jsonResponse, readJson } from "../_shared/http.ts";
import type {
  QuestCompletionResult,
  ReflectionPrompt,
} from "../../../src/shared/api/contracts.ts";

const commandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("prompt"),
    attemptId: z.uuid(),
  }),
  z.object({
    action: z.literal("complete"),
    attemptId: z.uuid(),
    idempotencyKey: z.uuid(),
    reflectionChoice: z.enum(["apply", "discuss", "revisit"]),
    reflectionNote: z.string().trim().max(240).optional(),
  }),
]);

function completionError(message: string): {
  code: string;
  status: number;
} {
  if (message.includes("ATTEMPT_NOT_AVAILABLE")) {
    return { code: "ATTEMPT_NOT_AVAILABLE", status: 404 };
  }
  if (
    message.includes("FINAL_INCOMPLETE") ||
    message.includes("RETRY_INCOMPLETE") ||
    message.includes("RETRY_TARGET_INVALID")
  ) {
    return { code: "QUEST_NOT_READY", status: 409 };
  }
  if (message.includes("INVALID_COMPLETION")) {
    return { code: "INVALID_COMPLETION", status: 400 };
  }
  return { code: "QUEST_NOT_READY", status: 409 };
}

Deno.serve(async (request) => {
  let headers: Record<string, string> = {};
  try {
    headers = corsHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "POST") {
      return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405, headers);
    }

    const command = commandSchema.parse(await readJson(request));
    const client = callerClient(request);
    const user = await client.auth.getUser();
    if (user.error || !user.data.user) {
      return jsonResponse({ error: "AUTH_REQUIRED" }, 401, headers);
    }

    if (command.action === "prompt") {
      const prompt = await client.rpc("get_reflection_prompt", {
        p_attempt_id: command.attemptId,
      });
      if (prompt.error) {
        const mapped = completionError(prompt.error.message);
        return jsonResponse({ error: mapped.code }, mapped.status, headers);
      }
      return jsonResponse(
        { prompt: prompt.data as ReflectionPrompt },
        200,
        headers,
      );
    }

    const result = await client.rpc("complete_quest", {
      p_attempt_id: command.attemptId,
      p_idempotency_key: command.idempotencyKey,
      p_reflection_choice: command.reflectionChoice,
      p_reflection_note: command.reflectionNote ?? null,
    });
    if (result.error) {
      const mapped = completionError(result.error.message);
      return jsonResponse({ error: mapped.code }, mapped.status, headers);
    }
    return jsonResponse(
      { result: result.data as QuestCompletionResult },
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
        error: status === 401 ? "AUTH_REQUIRED" : "INVALID_COMPLETION",
      },
      status,
      headers,
    );
  }
});
