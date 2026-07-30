import {
  createRecoveryToken,
  recoverStudent,
  RecoveryBoundaryError,
  type RecoveryDependencies,
} from "../functions/_shared/recovery-core";
import {
  executeGroupIdentityCommand,
  GroupIdentityBoundaryError,
  type GroupIdentityDependencies,
} from "../functions/_shared/group-core";

function recoveryDependencies(): RecoveryDependencies & {
  consumed: Set<string>;
} {
  const consumed = new Set<string>();
  return {
    consumed,
    async consumeToken(tokenHash) {
      if (consumed.has(tokenHash)) {
        throw new RecoveryBoundaryError("RECOVERY_LINK_USED", 410);
      }
      consumed.add(tokenHash);
      return { studentId: "20000000-0000-4000-8000-000000000001" };
    },
    async issueSession() {
      return {
        accessToken: "replacement-access-token",
        refreshToken: "replacement-refresh-token",
      };
    },
  };
}

it("creates a five-minute recovery token without persisting the raw value", async () => {
  const issuedAt = new Date("2026-07-30T05:00:00.000Z");

  const result = await createRecoveryToken(
    "50000000-0000-4000-8000-000000000001",
    "a-recovery-signing-secret-that-is-at-least-32-bytes",
    issuedAt,
  );

  expect(result.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(result.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  expect(result.expiresAt).toBe("2026-07-30T05:05:00.000Z");
  expect(result.tokenHash).not.toContain(result.rawToken);
});

it("redeems a recovery link once for the existing student", async () => {
  const dependencies = recoveryDependencies();

  const first = await recoverStudent(
    {
      recoveryToken: "single-use-recovery-token-with-enough-entropy",
      requestKey: "50000000-0000-4000-8000-000000000001",
    },
    dependencies,
  );

  expect(first.studentId).toBe("20000000-0000-4000-8000-000000000001");
  await expect(
    recoverStudent(
      {
        recoveryToken: "single-use-recovery-token-with-enough-entropy",
        requestKey: "50000000-0000-4000-8000-000000000002",
      },
      dependencies,
    ),
  ).rejects.toMatchObject({ code: "RECOVERY_LINK_USED", status: 410 });
});

it.each([
  ["RECOVERY_LINK_EXPIRED", 410],
  ["RECOVERY_SCOPE_REJECTED", 403],
] as const)("returns a safe %s boundary", async (code, status) => {
  const dependencies = recoveryDependencies();
  dependencies.consumeToken = async () => {
    throw new RecoveryBoundaryError(code, status);
  };

  await expect(
    recoverStudent(
      {
        recoveryToken: "single-use-recovery-token-with-enough-entropy",
        requestKey: "50000000-0000-4000-8000-000000000001",
      },
      dependencies,
    ),
  ).rejects.toMatchObject({ code, status });
});

function groupDependencies(
  actor: "editor" | "member" | "teacher",
): GroupIdentityDependencies {
  return {
    async execute(command) {
      if (command.action === "rename" && actor === "member") {
        throw new GroupIdentityBoundaryError("GROUP_ACTION_DENIED", 403);
      }
      if (
        (command.action === "lock" || command.action === "unlock") &&
        actor !== "teacher"
      ) {
        throw new GroupIdentityBoundaryError("GROUP_ACTION_DENIED", 403);
      }
      return {
        groupId: command.groupId,
        groupNumber: 1,
        displayName:
          command.action === "rename" ? command.displayName : "Group 1",
        imageObjectPath: null,
        lockedAt: command.action === "lock" ? "2026-07-30T05:00:00.000Z" : null,
      };
    },
  };
}

it("allows the current editor to rename using normalized plain text", async () => {
  const result = await executeGroupIdentityCommand(
    {
      action: "rename",
      groupId: "60000000-0000-4000-8000-000000000001",
      displayName: "  Future   Sparks  ",
      requestKey: "50000000-0000-4000-8000-000000000001",
    },
    groupDependencies("editor"),
  );

  expect(result.displayName).toBe("Future Sparks");
});

it("denies an ordinary member from changing the group identity", async () => {
  await expect(
    executeGroupIdentityCommand(
      {
        action: "rename",
        groupId: "60000000-0000-4000-8000-000000000001",
        displayName: "Unauthorised change",
        requestKey: "50000000-0000-4000-8000-000000000001",
      },
      groupDependencies("member"),
    ),
  ).rejects.toMatchObject({ code: "GROUP_ACTION_DENIED", status: 403 });
});

it("allows only a teacher to lock group identity editing", async () => {
  const command = {
    action: "lock" as const,
    groupId: "60000000-0000-4000-8000-000000000001",
    requestKey: "50000000-0000-4000-8000-000000000001",
  };

  await expect(
    executeGroupIdentityCommand(command, groupDependencies("editor")),
  ).rejects.toMatchObject({ code: "GROUP_ACTION_DENIED" });
  await expect(
    executeGroupIdentityCommand(command, groupDependencies("teacher")),
  ).resolves.toMatchObject({ lockedAt: "2026-07-30T05:00:00.000Z" });
});
