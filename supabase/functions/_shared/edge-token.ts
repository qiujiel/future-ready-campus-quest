export interface ExpiringToken {
  rawToken: string;
  tokenHash: string;
  expiresAt: string;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashEdgeToken(rawToken: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rawToken),
  );
  return bytesToHex(new Uint8Array(digest));
}

export async function deriveEdgeToken(
  requestKey: string,
  signingSecret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(requestKey),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function createEdgeRecoveryToken(
  requestKey: string,
  signingSecret: string,
  issuedAt = new Date(),
): Promise<ExpiringToken> {
  const rawToken = await deriveEdgeToken(requestKey, signingSecret);
  return {
    rawToken,
    tokenHash: await hashEdgeToken(rawToken),
    expiresAt: new Date(issuedAt.getTime() + 5 * 60 * 1000).toISOString(),
  };
}
