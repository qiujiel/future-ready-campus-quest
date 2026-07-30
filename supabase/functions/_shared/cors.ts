export class RequestOriginError extends Error {
  readonly status = 403;
}

function allowedOrigins(): Set<string> {
  const configured = Deno.env.get("ALLOWED_FRONTEND_ORIGINS") ?? "";
  return new Set(
    configured
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  if (!origin || !allowedOrigins().has(origin)) {
    throw new RequestOriginError("ORIGIN_NOT_ALLOWED");
  }

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}
