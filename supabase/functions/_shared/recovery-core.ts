import { z } from "zod";
import type {
  RecoverStudentInput,
  RecoverStudentOutput,
  SessionTokens,
} from "../../../src/shared/api/contracts.ts";
import { deriveJoinToken, hashJoinToken } from "./join-core.ts";

const inputSchema = z.object({
  recoveryToken: z.string().min(20).max(512),
  requestKey: z.uuid(),
});

export type RecoveryFailureCode =
  | "INVALID_RECOVERY_REQUEST"
  | "RECOVERY_LINK_EXPIRED"
  | "RECOVERY_LINK_USED"
  | "RECOVERY_SCOPE_REJECTED"
  | "RECOVERY_NOT_AVAILABLE";

export class RecoveryBoundaryError extends Error {
  constructor(
    readonly code: RecoveryFailureCode,
    readonly status: number,
  ) {
    super(code);
    this.name = "RecoveryBoundaryError";
  }
}

export interface RecoveryDependencies {
  consumeToken(
    tokenHash: string,
    requestKey: string,
  ): Promise<{ studentId: string }>;
  issueSession(studentId: string): Promise<SessionTokens>;
}

export interface RecoveryToken {
  rawToken: string;
  tokenHash: string;
  expiresAt: string;
}

export async function createRecoveryToken(
  requestKey: string,
  signingSecret: string,
  issuedAt = new Date(),
): Promise<RecoveryToken> {
  const rawToken = await deriveJoinToken(requestKey, signingSecret);
  return {
    rawToken,
    tokenHash: await hashJoinToken(rawToken),
    expiresAt: new Date(issuedAt.getTime() + 5 * 60 * 1000).toISOString(),
  };
}

export async function recoverStudent(
  input: RecoverStudentInput,
  dependencies: RecoveryDependencies,
): Promise<RecoverStudentOutput> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    throw new RecoveryBoundaryError("INVALID_RECOVERY_REQUEST", 400);
  }

  try {
    const tokenHash = await hashJoinToken(parsed.data.recoveryToken);
    const recovery = await dependencies.consumeToken(
      tokenHash,
      parsed.data.requestKey,
    );
    const session = await dependencies.issueSession(recovery.studentId);
    return { studentId: recovery.studentId, ...session };
  } catch (error) {
    if (error instanceof RecoveryBoundaryError) throw error;
    throw new RecoveryBoundaryError("RECOVERY_NOT_AVAILABLE", 409);
  }
}
