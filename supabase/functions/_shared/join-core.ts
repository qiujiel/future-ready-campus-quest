import { z } from "zod";
import type {
  JoinCohortInput,
  JoinCohortOutput,
  SessionTokens,
  StudentIdentity,
} from "../../../src/shared/api/contracts.ts";

const uuidSchema = z.uuid();

const joinInputSchema = z.object({
  joinToken: z.string().min(20).max(512),
  groupNumber: z.number().int().min(1).max(20),
  realName: z.string().trim().min(1).max(100),
  nickname: z.string().trim().max(40).optional(),
  privacyConfirmed: z.literal(true),
  requestKey: uuidSchema,
});

export type JoinFailureCode =
  | "INVALID_REQUEST"
  | "JOIN_WINDOW_CLOSED"
  | "INVALID_GROUP"
  | "GROUP_FULL"
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
  password: string;
}

export interface CompleteJoinInput {
  tokenHash: string;
  requestKey: string;
  studentId: string;
  groupNumber: number;
  realName: string;
  nickname?: string;
}

export interface JoinDependencies {
  findCompletedJoin(
    tokenHash: string,
    requestKey: string,
  ): Promise<StoredJoin | null>;
  createSyntheticUser(): Promise<SyntheticUser>;
  signInNewUser(user: SyntheticUser): Promise<SessionTokens>;
  issueReplacementSession(studentId: string): Promise<SessionTokens>;
  completeJoin(input: CompleteJoinInput): Promise<StudentIdentity>;
  deleteSyntheticUser(studentId: string): Promise<void>;
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

  const realName = normalizeWhitespace(result.data.realName);
  const normalizedNickname = result.data.nickname
    ? normalizeWhitespace(result.data.nickname)
    : "";

  return {
    joinToken: result.data.joinToken,
    groupNumber: result.data.groupNumber,
    realName,
    privacyConfirmed: true,
    requestKey: result.data.requestKey,
    ...(normalizedNickname ? { nickname: normalizedNickname } : {}),
  };
}

export async function joinStudent(
  input: JoinCohortInput,
  dependencies: JoinDependencies,
): Promise<JoinCohortOutput> {
  const normalized = parseInput(input);
  const tokenHash = await hashJoinToken(normalized.joinToken);
  const completed = await dependencies.findCompletedJoin(
    tokenHash,
    normalized.requestKey,
  );

  if (completed) {
    const session = await dependencies.issueReplacementSession(
      completed.identity.studentId,
    );
    return { identity: completed.identity, ...session };
  }

  let syntheticUser: SyntheticUser | undefined;
  let initialSession: SessionTokens | undefined;
  try {
    syntheticUser = await dependencies.createSyntheticUser();
    initialSession = await dependencies.signInNewUser(syntheticUser);
    const identity = await dependencies.completeJoin({
      tokenHash,
      requestKey: normalized.requestKey,
      studentId: syntheticUser.studentId,
      groupNumber: normalized.groupNumber,
      realName: normalized.realName,
      ...(normalized.nickname ? { nickname: normalized.nickname } : {}),
    });

    if (identity.studentId !== syntheticUser.studentId) {
      await dependencies.deleteSyntheticUser(syntheticUser.studentId);
      const replacementSession = await dependencies.issueReplacementSession(
        identity.studentId,
      );
      return { identity, ...replacementSession };
    }

    return { identity, ...initialSession };
  } catch (error) {
    if (
      syntheticUser &&
      initialSession &&
      !(error instanceof JoinBoundaryError)
    ) {
      try {
        const reconciled = await dependencies.findCompletedJoin(
          tokenHash,
          normalized.requestKey,
        );
        if (reconciled) {
          if (reconciled.identity.studentId === syntheticUser.studentId) {
            return { identity: reconciled.identity, ...initialSession };
          }
          await dependencies.deleteSyntheticUser(syntheticUser.studentId);
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
      await dependencies.deleteSyntheticUser(syntheticUser.studentId);
    }
    if (error instanceof JoinBoundaryError) throw error;
    throw new JoinBoundaryError("JOIN_NOT_AVAILABLE", 409);
  }
}
