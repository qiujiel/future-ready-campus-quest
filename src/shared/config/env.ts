import { z } from "zod";

const publicEnvironmentSchema = z.object({
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  VITE_BASE_PATH: z.string().default("/"),
});

export type PublicEnvironment = z.infer<typeof publicEnvironmentSchema>;

export function readPublicEnvironment(
  source: Record<string, unknown> = import.meta.env,
): PublicEnvironment {
  return publicEnvironmentSchema.parse(source);
}
