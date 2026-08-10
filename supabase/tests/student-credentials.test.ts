import {
  deriveStudentNameLookupHash,
  hashStudentPasscode,
  normalizeStudentName,
  verifyStudentPasscode,
} from "../functions/_shared/student-credentials-core";

it("normalizes names without exposing them in the lookup hash", async () => {
  const normalized = normalizeStudentName("  Alex   Tan  ");
  const hash = await deriveStudentNameLookupHash(
    "40000000-0000-4000-8000-000000000001",
    normalized,
    "0123456789abcdef0123456789abcdef",
  );
  expect(normalized).toBe("Alex Tan");
  expect(hash).toMatch(/^[a-f0-9]{64}$/);
  expect(hash).not.toContain("Alex");
});

it("accepts only four digits and verifies the salted PBKDF2 result", async () => {
  const stored = await hashStudentPasscode("4826", {
    salt: new Uint8Array(16).fill(7),
    iterations: 10,
  });
  await expect(verifyStudentPasscode("4826", stored)).resolves.toBe(true);
  await expect(verifyStudentPasscode("4827", stored)).resolves.toBe(false);
  await expect(hashStudentPasscode("123", { iterations: 10 })).rejects.toThrow(
    "INVALID_STUDENT_PASSCODE",
  );
});
