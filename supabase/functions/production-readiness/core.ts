const encoder = new TextEncoder();

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
