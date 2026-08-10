import { z } from "zod";
import type {
  GroupIdentityCommand,
  PublicGroupIdentity,
} from "../../../src/shared/api/contracts.ts";

const commandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("rename"),
    groupId: z.uuid(),
    displayName: z.string().trim().min(2).max(40),
    requestKey: z.uuid(),
  }),
  z.object({
    action: z.literal("lock"),
    groupId: z.uuid(),
    requestKey: z.uuid(),
  }),
  z.object({
    action: z.literal("unlock"),
    groupId: z.uuid(),
    requestKey: z.uuid(),
  }),
]);

export type GroupIdentityFailureCode =
  | "INVALID_GROUP_ACTION"
  | "GROUP_ACTION_DENIED"
  | "GROUP_IDENTITY_LOCKED"
  | "GROUP_MEMBER_INVALID"
  | "GROUP_ACTION_NOT_AVAILABLE";

export class GroupIdentityBoundaryError extends Error {
  constructor(
    readonly code: GroupIdentityFailureCode,
    readonly status: number,
  ) {
    super(code);
    this.name = "GroupIdentityBoundaryError";
  }
}

export interface GroupIdentityDependencies {
  execute(command: GroupIdentityCommand): Promise<PublicGroupIdentity>;
}

export async function executeGroupIdentityCommand(
  command: unknown,
  dependencies: GroupIdentityDependencies,
): Promise<PublicGroupIdentity> {
  const parsed = commandSchema.safeParse(command);
  if (!parsed.success) {
    throw new GroupIdentityBoundaryError("INVALID_GROUP_ACTION", 400);
  }

  const normalized: GroupIdentityCommand =
    parsed.data.action === "rename"
      ? {
          ...parsed.data,
          displayName: parsed.data.displayName.replace(/\s+/g, " ").trim(),
        }
      : parsed.data;

  try {
    return await dependencies.execute(normalized);
  } catch (error) {
    if (error instanceof GroupIdentityBoundaryError) throw error;
    throw new GroupIdentityBoundaryError("GROUP_ACTION_NOT_AVAILABLE", 409);
  }
}
