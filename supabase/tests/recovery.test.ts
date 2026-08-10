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
  claims: Map<string, string>;
} {
  const claims = new Map<string, string>();
  return {
    claims,
    async claimToken(tokenHash, requestKey) {
      const claimedBy = claims.get(tokenHash);
      if (claimedBy && claimedBy !== requestKey) {
        throw new RecoveryBoundaryError("RECOVERY_LINK_USED", 410);
      }
      claims.set(tokenHash, requestKey);
      return { studentId: "20000000-0000-4000-8000-000000000001" };
    },
    async issueSession() {
      return {
        accessToken: "replacement-access-token",
        refreshToken: "replacement-refresh-token",
      };
    },
    async finalizeToken() {},
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
  dependencies.claimToken = async () => {
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

it("lets the winning request retry when session issuance fails", async () => {
  const dependencies = recoveryDependencies();
  let attempts = 0;
  dependencies.issueSession = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("session mint failed");
    return {
      accessToken: "replacement-access-token",
      refreshToken: "replacement-refresh-token",
    };
  };

  const input = {
    recoveryToken: "single-use-recovery-token-with-enough-entropy",
    requestKey: "50000000-0000-4000-8000-000000000001",
  };
  await expect(recoverStudent(input, dependencies)).rejects.toMatchObject({
    code: "RECOVERY_NOT_AVAILABLE",
  });
  await expect(recoverStudent(input, dependencies)).resolves.toMatchObject({
    studentId: "20000000-0000-4000-8000-000000000001",
  });
});

it("allows only the winning request key to replay a finalized recovery", async () => {
  const dependencies = recoveryDependencies();
  const input = {
    recoveryToken: "single-use-recovery-token-with-enough-entropy",
    requestKey: "50000000-0000-4000-8000-000000000001",
  };

  await expect(recoverStudent(input, dependencies)).resolves.toBeDefined();
  await expect(recoverStudent(input, dependencies)).resolves.toBeDefined();
  await expect(
    recoverStudent(
      {
        ...input,
        requestKey: "50000000-0000-4000-8000-000000000002",
      },
      dependencies,
    ),
  ).rejects.toMatchObject({ code: "RECOVERY_LINK_USED" });
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

it("rejects student leader transfer commands before invoking the database", async () => {
  const execute = vi.fn(async () => ({
    groupId: "60000000-0000-4000-8000-000000000001",
    groupNumber: 1,
    displayName: "Group 1",
    imageObjectPath: null,
    lockedAt: null,
  }));

  await expect(
    executeGroupIdentityCommand(
      {
        action: "transfer-editor",
        groupId: "60000000-0000-4000-8000-000000000001",
        nextEditorId: "20000000-0000-4000-8000-000000000002",
        requestKey: "50000000-0000-4000-8000-000000000002",
      },
      { execute },
    ),
  ).rejects.toMatchObject({ code: "INVALID_GROUP_ACTION", status: 400 });
  expect(execute).not.toHaveBeenCalled();
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
