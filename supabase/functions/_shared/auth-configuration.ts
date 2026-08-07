interface SupabaseKeyEnvironment {
  FRCQ_SUPABASE_PUBLISHABLE_KEY?: string;
  FRCQ_SUPABASE_SECRET_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

function value(environment: SupabaseKeyEnvironment, name: keyof SupabaseKeyEnvironment) {
  return environment[name]?.trim() ?? "";
}

export function selectSupabaseKeys(environment: SupabaseKeyEnvironment): {
  publishableKey: string;
  secretKey: string;
} {
  const modernPublishable = value(environment, "FRCQ_SUPABASE_PUBLISHABLE_KEY");
  const modernSecret = value(environment, "FRCQ_SUPABASE_SECRET_KEY");

  if (modernPublishable || modernSecret) {
    if (!modernPublishable) throw new Error("Missing modern Supabase publishable key");
    if (!modernSecret) throw new Error("Missing modern Supabase privileged key");
    return { publishableKey: modernPublishable, secretKey: modernSecret };
  }

  const legacyPublishable = value(environment, "SUPABASE_ANON_KEY");
  const legacySecret = value(environment, "SUPABASE_SERVICE_ROLE_KEY");
  if (!legacyPublishable) throw new Error("Missing local Supabase publishable key");
  if (!legacySecret) throw new Error("Missing local Supabase privileged key");
  return { publishableKey: legacyPublishable, secretKey: legacySecret };
}
