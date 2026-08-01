import { adminClient } from "../_shared/auth.ts";
import { corsHeaders, RequestOriginError } from "../_shared/cors.ts";
import { jsonResponse, readJson } from "../_shared/http.ts";
import { readinessSecretMatches } from "./core.ts";

interface ReadinessInput {
  contentVersion?: unknown;
  teacherId?: unknown;
  cohortId?: unknown;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("INVALID_READINESS_INPUT");
  }
  return value.trim();
}

Deno.serve(async (request) => {
  let headers: Record<string, string> = {};
  try {
    headers = corsHeaders(request);
    if (request.method === "OPTIONS") return new Response(null, { headers });
    if (request.method !== "POST") {
      return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405, headers);
    }
    if (!await readinessSecretMatches(
      request.headers.get("x-production-readiness-key") ?? undefined,
      Deno.env.get("PRODUCTION_READINESS_SECRET"),
    )) {
      return jsonResponse({ error: "READINESS_NOT_AVAILABLE" }, 403, headers);
    }
    const input = await readJson(request) as ReadinessInput;
    const result = await adminClient().rpc("get_production_readiness_report", {
      p_content_version_key: requiredString(input.contentVersion),
      p_smoke_teacher_id: requiredString(input.teacherId),
      p_smoke_cohort_id: requiredString(input.cohortId),
    });
    if (result.error) throw new Error("READINESS_RPC_FAILED");
    return jsonResponse(result.data, 200, headers);
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof RequestOriginError
            ? "ORIGIN_NOT_ALLOWED"
            : "READINESS_NOT_AVAILABLE",
      },
      error instanceof RequestOriginError ? error.status : 400,
      headers,
    );
  }
});
