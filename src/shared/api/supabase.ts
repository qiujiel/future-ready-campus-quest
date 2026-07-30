import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readPublicEnvironment } from "../config/env";

let browserClient: SupabaseClient | undefined;

export function getSupabaseClient(): SupabaseClient {
  if (!browserClient) {
    const environment = readPublicEnvironment();
    browserClient = createClient(
      environment.VITE_SUPABASE_URL,
      environment.VITE_SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          detectSessionInUrl: false,
          persistSession: true,
        },
      },
    );
  }

  return browserClient;
}
