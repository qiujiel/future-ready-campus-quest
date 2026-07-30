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

export async function issueSessionForExistingUser(
  admin: SupabaseClient,
  publicClient: SupabaseClient,
  studentId: string,
): Promise<{ accessToken: string; refreshToken: string }> {
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
  const session = verified.data.session;
  if (verified.error || !session) throw new Error("AUTH_SESSION_FAILED");
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  };
}
