import { z } from "zod";
import type {
  SessionTokens,
  StudentIdentity,
  StudentLoginInput,
  StudentLoginOutput,
} from "../../../src/shared/api/contracts.ts";
import {
  normalizeStudentName,
  type StoredPasscode,
} from "./student-credentials-core.ts";

const uuidSchema = z.uuid();
const inputSchema = z.object({
  classAccessId: z.string(),
  displayName: z.string(),
  passcode: z.string().regex(/^\d{4}$/),
  requestKey: z.string(),
});

export type StudentLoginFailureCode =
  | "INVALID_REQUEST"
  | "STUDENT_LOGIN_NOT_ACCEPTED"
  | "LOGIN_NOT_AVAILABLE";

export class StudentLoginBoundaryError extends Error {
  constructor(
    readonly code: StudentLoginFailureCode,
    readonly status: number,
  ) {
    super(code);
    this.name = "StudentLoginBoundaryError";
  }
}

export interface StudentLoginCandidate {
  studentId: string;
  credential: StoredPasscode;
}

export interface StudentLoginDependencies {
  beginAttempt(
    classAccessId: string,
    normalizedName: string,
    requestKey: string,
  ): Promise<{ attemptId: string; candidates: StudentLoginCandidate[] }>;
  verifyPasscode(
    passcode: string,
    credential: StoredPasscode,
  ): Promise<boolean>;
  dummyCredential: StoredPasscode;
  finishAttempt(
    attemptId: string,
    succeeded: boolean,
    studentId?: string,
  ): Promise<void>;
  loadIdentity(studentId: string): Promise<StudentIdentity>;
  issueSession(studentId: string): Promise<SessionTokens>;
}

function parseInput(input: StudentLoginInput): StudentLoginInput {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw new StudentLoginBoundaryError("INVALID_REQUEST", 400);
  }

  const classAccessId = uuidSchema.safeParse(parsed.data.classAccessId);
  const requestKey = uuidSchema.safeParse(parsed.data.requestKey);
  const displayName = normalizeStudentName(parsed.data.displayName);
  if (
    !classAccessId.success ||
    !requestKey.success ||
    displayName.length === 0 ||
    displayName.length > 100
  ) {
    throw new StudentLoginBoundaryError("INVALID_REQUEST", 400);
  }

  return {
    classAccessId: classAccessId.data.toLowerCase(),
    displayName,
    passcode: parsed.data.passcode,
    requestKey: requestKey.data,
  };
}

function neutralFailure(): StudentLoginBoundaryError {
  return new StudentLoginBoundaryError("STUDENT_LOGIN_NOT_ACCEPTED", 401);
}

async function finishFailureSafely(
  attemptId: string,
  dependencies: StudentLoginDependencies,
): Promise<void> {
  try {
    await dependencies.finishAttempt(attemptId, false);
  } catch {
    // Keep the credential response neutral if finalization is unavailable.
  }
}

export async function loginStudent(
  input: StudentLoginInput,
  dependencies: StudentLoginDependencies,
): Promise<StudentLoginOutput> {
  const normalized = parseInput(input);
  let attempt: Awaited<ReturnType<StudentLoginDependencies["beginAttempt"]>>;
  try {
    attempt = await dependencies.beginAttempt(
      normalized.classAccessId,
      normalized.displayName,
      normalized.requestKey,
    );
  } catch (error) {
    try {
      await dependencies.verifyPasscode(
        normalized.passcode,
        dependencies.dummyCredential,
      );
    } catch {
      // Preserve the neutral trusted-boundary result if dummy work fails.
    }
    if (error instanceof StudentLoginBoundaryError) throw error;
    throw neutralFailure();
  }
  const candidates = attempt.candidates.slice(0, 4);

  let matches: StudentLoginCandidate[];
  try {
    if (candidates.length === 0) {
      await dependencies.verifyPasscode(
        normalized.passcode,
        dependencies.dummyCredential,
      );
      matches = [];
    } else {
      const verified = await Promise.all(
        candidates.map((candidate) =>
          dependencies.verifyPasscode(
            normalized.passcode,
            candidate.credential,
          )
        ),
      );
      matches = candidates.filter((_candidate, index) => verified[index]);
    }
  } catch {
    await finishFailureSafely(attempt.attemptId, dependencies);
    throw neutralFailure();
  }

  if (matches.length !== 1) {
    await finishFailureSafely(attempt.attemptId, dependencies);
    throw neutralFailure();
  }

  const studentId = matches[0].studentId;
  try {
    await dependencies.finishAttempt(attempt.attemptId, true, studentId);
    const identity = await dependencies.loadIdentity(studentId);
    const session = await dependencies.issueSession(studentId);
    return { identity, ...session };
  } catch {
    throw neutralFailure();
  }
}
