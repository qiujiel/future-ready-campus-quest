const encoder = new TextEncoder();

export const APPLICATION_FUNCTION_NAMES = Object.freeze([
  "complete-quest",
  "export-cohort",
  "get-next-item",
  "join-cohort",
  "manage-group-identity",
  "manage-join-window",
  "recover-student",
  "submit-response",
  "teacher-controls",
  "teacher-dashboard",
]);

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(value)),
  );
}

export async function readinessSecretMatches(
  provided: string | undefined,
  configured: string | undefined,
): Promise<boolean> {
  if (!provided || !configured || configured.length < 32) return false;
  const [left, right] = await Promise.all([
    digest(provided),
    digest(configured),
  ]);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function probeFunctionBoundaries({
  supabaseUrl,
  anonKey,
  serviceRoleKey,
  frontendOrigin,
  fetcher = fetch,
}: {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  frontendOrigin: string;
  fetcher?: typeof fetch;
}): Promise<{ edgeFunctionsReady: number }> {
  const failures: string[] = [];
  await Promise.all(APPLICATION_FUNCTION_NAMES.map(async (name) => {
    try {
      const response = await fetcher(
        `${supabaseUrl}/functions/v1/${name}`,
        {
          method: "GET",
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            Origin: frontendOrigin,
          },
        },
      );
      if (response.status !== 405) {
        failures.push(`${name} returned ${response.status}`);
      }
    } catch {
      failures.push(`${name} could not be reached`);
    }
  }));
  if (failures.length) {
    throw new Error(`Edge Function preflight failed: ${failures.sort().join("; ")}`);
  }
  return { edgeFunctionsReady: APPLICATION_FUNCTION_NAMES.length };
}
