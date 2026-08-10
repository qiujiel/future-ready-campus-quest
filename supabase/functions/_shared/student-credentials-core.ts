export const STUDENT_PASSCODE_ITERATIONS = 210_000;

export interface StoredPasscode {
  salt: string;
  hash: string;
  iterations: number;
}

const studentPasscodePattern = /^\d{4}$/;
const saltLength = 16;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) {
    return null;
  }

  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(base64);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(
    bytes,
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

function hasValidIterations(iterations: number): boolean {
  return Number.isSafeInteger(iterations) && iterations > 0;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

async function derivePasscodeHash(
  passcode: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const saltBuffer = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltBuffer).set(salt);
  const passcodeKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passcode),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        salt: saltBuffer,
        iterations,
      },
      passcodeKey,
      256,
    ),
  );
}

export function normalizeStudentName(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export async function deriveStudentNameLookupHash(
  classAccessId: string,
  normalizedName: string,
  secret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${classAccessId}:${normalizedName}`),
  );
  return bytesToHex(new Uint8Array(signature));
}

export async function hashStudentPasscode(
  passcode: string,
  options: { salt?: Uint8Array; iterations?: number } = {},
): Promise<StoredPasscode> {
  if (!studentPasscodePattern.test(passcode)) {
    throw new Error("INVALID_STUDENT_PASSCODE");
  }

  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(saltLength));
  if (salt.length !== saltLength) {
    throw new Error("INVALID_STUDENT_PASSCODE_SALT");
  }

  const iterations = options.iterations ?? STUDENT_PASSCODE_ITERATIONS;
  if (!hasValidIterations(iterations)) {
    throw new Error("INVALID_STUDENT_PASSCODE_ITERATIONS");
  }

  const hash = await derivePasscodeHash(passcode, salt, iterations);
  return {
    salt: bytesToBase64Url(salt),
    hash: bytesToBase64Url(hash),
    iterations,
  };
}

export async function verifyStudentPasscode(
  passcode: string,
  stored: StoredPasscode,
): Promise<boolean> {
  if (!studentPasscodePattern.test(passcode)) return false;
  if (!hasValidIterations(stored.iterations)) return false;

  const salt = base64UrlToBytes(stored.salt);
  const expectedHash = base64UrlToBytes(stored.hash);
  if (!salt || salt.length !== saltLength || !expectedHash) return false;

  const actualHash = await derivePasscodeHash(passcode, salt, stored.iterations);
  return equalBytes(actualHash, expectedHash);
}
