import { z } from "zod";
import type {
  JoinCohortInput,
  JoinCohortOutput,
  SessionTokens,
  StudentIdentity,
} from "../../../src/shared/api/contracts.ts";
import type { StoredPasscode } from "./student-credentials-core.ts";

const uuidSchema = z.uuid();
const groupCodeAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

const joinInputSchema = z.object({
  classAccessId: uuidSchema,
  joinCode: z.string().min(6).max(16),
  displayName: z.string().trim().min(1).max(100),
  passcode: z.string().regex(/^\d{4}$/),
  wantsLeader: z.boolean(),
  requestKey: uuidSchema,
});

export type JoinFailureCode =
  | "INVALID_REQUEST"
  | "INVALID_JOIN_CODE"
  | "GROUP_JOIN_CLOSED"
  | "INACTIVE_COHORT"
  | "JOIN_WINDOW_CLOSED"
  | "INVALID_GROUP"
  | "GROUP_FULL"
  | "STUDENT_RECOVERY_REQUIRED"
  | "STUDENT_NAME_NOT_AVAILABLE"
  | "JOIN_NOT_AVAILABLE";

export class JoinBoundaryError extends Error {
  constructor(
    readonly code: JoinFailureCode,
    readonly status: number,
  ) {
    super(code);
    this.name = "JoinBoundaryError";
  }
}

export interface StoredJoin {
  identity: StudentIdentity;
}

export interface SyntheticUser {
  studentId: string;
  internalEmail: string;
  initialTokenHash: string;
}

export interface CompleteJoinInput {
  classAccessId: string;
  codeHash: string;
  requestKey: string;
  studentId: string;
  groupNumber: number;
  displayName: string;
  wantsLeader: boolean;
  nameLookupHash: string;
  passcodeSalt: string;
  passcodeHash: string;
  passcodeIterations: number;
}

export interface StudentJoinCredential {
  nameLookupHash: string;
  passcode: StoredPasscode;
}

export interface JoinDependencies {
  prepareJoin(
    codeHash: string,
    requestKey: string,
    classAccessId: string,
  ): Promise<{ completed: StoredJoin | null; groupNumber: number }>;
  createCredential(
    classAccessId: string,
    displayName: string,
    passcode: string,
  ): Promise<StudentJoinCredential>;
  findCompletedJoin(
    codeHash: string,
    requestKey: string,
  ): Promise<StoredJoin | null>;
  createSyntheticUser(): Promise<SyntheticUser>;
  signInNewUser(user: SyntheticUser): Promise<SessionTokens>;
  issueReplacementSession(studentId: string): Promise<SessionTokens>;
  completeJoin(input: CompleteJoinInput): Promise<StudentIdentity>;
  deleteSyntheticUser(studentId: string): Promise<void>;
  recordOrphanedIdentity(studentId: string): Promise<void>;
}

export interface JoinWindowToken {
  rawToken: string;
  tokenHash: string;
  expiresAt: string;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
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

export async function hashJoinToken(rawToken: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rawToken),
  );
  return bytesToHex(new Uint8Array(digest));
}

function fiveBitValue(bytes: Uint8Array, offset: number): number {
  let value = 0;
  for (let index = 0; index < 5; index += 1) {
    const bit = offset + index;
    const byte = bytes[Math.floor(bit / 8)] ?? 0;
    value = (value << 1) | ((byte >> (7 - (bit % 8))) & 1);
  }
  return value;
}

export async function deriveGroupJoinCode(
  requestKey: string,
  groupNumber: number,
  signingSecret: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${requestKey}:${groupNumber}`),
    ),
  );
  return Array.from({ length: 8 }, (_, index) =>
    groupCodeAlphabet[fiveBitValue(signature, index * 5)]
  ).join("");
}

export interface GroupJoinCodeSource {
  groupId: string;
  groupNumber: number;
}

export async function createGroupJoinCodes(
  groups: GroupJoinCodeSource[],
  requestKey: string,
  signingSecret: string,
) {
  const generated = await Promise.all(
    groups.map(async (group) => {
      const joinCode = await deriveGroupJoinCode(
        requestKey,
        group.groupNumber,
        signingSecret,
      );
      return {
        receipt: { ...group, joinCode, enabled: true as const },
        persistence: {
          groupId: group.groupId,
          codeHash: await hashJoinToken(joinCode),
        },
      };
    }),
  );
  return {
    receipts: generated.map((entry) => entry.receipt),
    persistence: generated.map((entry) => entry.persistence),
  };
}

export async function deriveJoinToken(
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

export async function createJoinWindowToken(
  openedAt = new Date(),
): Promise<JoinWindowToken> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const rawToken = bytesToBase64Url(bytes);
  return {
    rawToken,
    tokenHash: await hashJoinToken(rawToken),
    expiresAt: new Date(openedAt.getTime() + 15 * 60 * 1000).toISOString(),
  };
}

function parseInput(input: JoinCohortInput): JoinCohortInput {
  const result = joinInputSchema.safeParse(input);
  if (!result.success) {
    throw new JoinBoundaryError("INVALID_REQUEST", 400);
  }

  const displayName = normalizeWhitespace(result.data.displayName);
  const joinCode = result.data.joinCode
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();
  if (!new RegExp(`^[${groupCodeAlphabet}]{8}$`).test(joinCode)) {
    throw new JoinBoundaryError("INVALID_REQUEST", 400);
  }

  return {
    classAccessId: result.data.classAccessId.toLowerCase(),
    joinCode,
    displayName,
    passcode: result.data.passcode,
    wantsLeader: result.data.wantsLeader,
    requestKey: result.data.requestKey,
  };
}

export async function joinStudent(
  input: JoinCohortInput,
  dependencies: JoinDependencies,
): Promise<JoinCohortOutput> {
  const normalized = parseInput(input);
  const codeHash = await hashJoinToken(normalized.joinCode);
  const prepared = await dependencies.prepareJoin(
    codeHash,
    normalized.requestKey,
    normalized.classAccessId,
  );

  let syntheticUser: SyntheticUser | undefined;
  let initialSession: SessionTokens | undefined;
  let completedIdentity: StudentIdentity | undefined;
  try {
    const credential = await dependencies.createCredential(
      normalized.classAccessId,
      normalized.displayName,
      normalized.passcode,
    );
    const completion = {
      classAccessId: normalized.classAccessId,
      codeHash,
      requestKey: normalized.requestKey,
      groupNumber: prepared.groupNumber,
      displayName: normalized.displayName,
      wantsLeader: normalized.wantsLeader,
      nameLookupHash: credential.nameLookupHash,
      passcodeSalt: credential.passcode.salt,
      passcodeHash: credential.passcode.hash,
      passcodeIterations: credential.passcode.iterations,
    };

    if (prepared.completed) {
      const identity = await dependencies.completeJoin({
        ...completion,
        studentId: prepared.completed.identity.studentId,
      });
      const session = await dependencies.issueReplacementSession(
        identity.studentId,
      );
      return { identity, ...session };
    }

    syntheticUser = await dependencies.createSyntheticUser();
    const [sessionResult, identityResult] = await Promise.allSettled([
      dependencies.signInNewUser(syntheticUser),
      dependencies.completeJoin({
        ...completion,
        studentId: syntheticUser.studentId,
      }),
    ]);
    if (sessionResult.status === "fulfilled") {
      initialSession = sessionResult.value;
    }
    if (identityResult.status === "rejected") {
      throw identityResult.reason;
    }
    completedIdentity = identityResult.value;

    if (completedIdentity.studentId !== syntheticUser.studentId) {
      await deleteSyntheticUserSafely(syntheticUser.studentId, dependencies);
      const replacementSession = await dependencies.issueReplacementSession(
        completedIdentity.studentId,
      );
      return { identity: completedIdentity, ...replacementSession };
    }

    const session = initialSession ??
      await dependencies.issueReplacementSession(completedIdentity.studentId);
    return { identity: completedIdentity, ...session };
  } catch (error) {
    if (completedIdentity) {
      if (error instanceof JoinBoundaryError) throw error;
      throw new JoinBoundaryError("JOIN_NOT_AVAILABLE", 409);
    }
    if (
      syntheticUser &&
      !(error instanceof JoinBoundaryError)
    ) {
      try {
        const reconciled = await dependencies.findCompletedJoin(
          codeHash,
          normalized.requestKey,
        );
        if (reconciled) {
          if (reconciled.identity.studentId === syntheticUser.studentId) {
            const session = initialSession ??
              await dependencies.issueReplacementSession(
                reconciled.identity.studentId,
              );
            return { identity: reconciled.identity, ...session };
          }
          await deleteSyntheticUserSafely(syntheticUser.studentId, dependencies);
          const replacement = await dependencies.issueReplacementSession(
            reconciled.identity.studentId,
          );
          return { identity: reconciled.identity, ...replacement };
        }
      } catch {
        // The trusted boundary remains authoritative; continue with safe cleanup.
      }
    }
    if (syntheticUser) {
      try {
        await deleteSyntheticUserSafely(syntheticUser.studentId, dependencies);
      } catch {
        throw new JoinBoundaryError("JOIN_NOT_AVAILABLE", 409);
      }
    }
    if (error instanceof JoinBoundaryError) throw error;
    throw new JoinBoundaryError("JOIN_NOT_AVAILABLE", 409);
  }
}

async function deleteSyntheticUserSafely(
  studentId: string,
  dependencies: JoinDependencies,
): Promise<void> {
  try {
    await dependencies.deleteSyntheticUser(studentId);
  } catch (error) {
    try {
      await dependencies.recordOrphanedIdentity(studentId);
    } catch {
      // Preserve the cleanup failure; the audit path is best-effort only.
    }
    throw error;
  }
}
