import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment: ${name}`);
  return value;
}

export function adminClient(): SupabaseClient {
  return createClient(
    requiredEnvironment("SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

export function publicAuthClient(): SupabaseClient {
  return createClient(
    requiredEnvironment("SUPABASE_URL"),
    requiredEnvironment("SUPABASE_ANON_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

export function callerClient(request: Request): SupabaseClient {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("AUTH_REQUIRED");
  }

  return createClient(
    requiredEnvironment("SUPABASE_URL"),
    requiredEnvironment("SUPABASE_ANON_KEY"),
    {
      global: { headers: { Authorization: authorization } },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

export function frontendOrigin(): string {
  const firstOrigin = requiredEnvironment("ALLOWED_FRONTEND_ORIGINS")
    .split(",")
    .map((origin) => origin.trim())
    .find(Boolean);
  if (!firstOrigin) throw new Error("No allowed frontend origin configured.");
  return firstOrigin;
}
