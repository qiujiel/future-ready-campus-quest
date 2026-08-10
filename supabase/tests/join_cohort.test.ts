import {
  createGroupJoinCodes,
  deriveGroupJoinCode,
  JoinBoundaryError,
  joinStudent,
  type JoinDependencies,
  type StoredJoin,
} from "../functions/_shared/join-core";
import type {
  JoinCohortInput,
  SessionTokens,
  StudentIdentity,
} from "../../src/shared/api/contracts";

const baseInput: JoinCohortInput = {
  classAccessId: "40000000-0000-4000-8000-000000000099",
  joinCode: "FJP5-Z8YN",
  displayName: "  Synthetic   Learner  ",
  passcode: "4826",
  wantsLeader: true,
  requestKey: "50000000-0000-4000-8000-000000000001",
};

function createDependencies(capacity = 6): JoinDependencies & {
  createdUsers: number;
  deletedUsers: number;
  remainingCapacity: number;
  stored: Map<string, StoredJoin>;
} {
  const stored = new Map<string, StoredJoin>();
  let remainingCapacity = capacity;
  let nextStudent = 1;

  return {
    createdUsers: 0,
    deletedUsers: 0,
    get remainingCapacity() {
      return remainingCapacity;
    },
    set remainingCapacity(value: number) {
      remainingCapacity = value;
    },
    stored,
    async createCredential() {
      return {
        nameLookupHash:
          "b0c3cdb99f2679dace8734b4cbba5541c637555f7268bcda5c2aa6f86d27ee94",
        passcode: {
          salt: "BwcHBwcHBwcHBwcHBwcHBw",
          hash: "6bs7_7cRveH4ksIlN8Y-XUXqT69lkI68wQDlqS5wAao",
          iterations: 210_000,
        },
      };
    },
    async findCompletedJoin(codeHash, requestKey) {
      return stored.get(`${codeHash}:${requestKey}`) ?? null;
    },
    async prepareJoin(codeHash, requestKey) {
      const completed = stored.get(`${codeHash}:${requestKey}`) ?? null;
      return completed
        ? { completed, groupNumber: completed.identity.groupNumber }
        : { completed: null, groupNumber: 4 };
    },
    async createSyntheticUser() {
      this.createdUsers += 1;
      const studentId = `20000000-0000-4000-8000-${String(nextStudent).padStart(12, "0")}`;
      nextStudent += 1;
      return {
        studentId,
        internalEmail: `${studentId}@students.invalid`,
        initialTokenHash: "one-time-hash",
      };
    },
    async signInNewUser(): Promise<SessionTokens> {
      return {
        accessToken: "initial-access-token",
        refreshToken: "initial-refresh-token",
      };
    },
    async issueReplacementSession(): Promise<SessionTokens> {
      return {
        accessToken: "replacement-access-token",
        refreshToken: "replacement-refresh-token",
      };
    },
    async completeJoin(input) {
      const key = `${input.codeHash}:${input.requestKey}`;
      const existing = stored.get(key);
      if (existing) return existing.identity;
      if (remainingCapacity < 1) {
        throw new JoinBoundaryError("GROUP_FULL", 409);
      }

      remainingCapacity -= 1;
      const identity: StudentIdentity = {
        studentId: input.studentId,
        cohortId: "40000000-0000-4000-8000-000000000001",
        groupId: "60000000-0000-4000-8000-000000000004",
        groupNumber: input.groupNumber,
        nickname: "Explorer 1",
        isGroupIdentityEditor: remainingCapacity === capacity - 1,
      };
      stored.set(key, { identity });
      return identity;
    },
    async deleteSyntheticUser() {
      this.deletedUsers += 1;
    },
    async recordOrphanedIdentity() {},
  };
}

it("derives a stable unambiguous group code without exposing the secret", async () => {
  const result = await deriveGroupJoinCode(
    "50000000-0000-4000-8000-000000000001",
    4,
    "0123456789abcdef0123456789abcdef",
  );

  expect(result).toBe("FJP5Z8YN");
  expect(result).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);
  expect(result).not.toContain("0123456789abcdef");
});

it("builds distinct teacher receipts and hash-only persistence rows", async () => {
  const result = await createGroupJoinCodes(
    [
      { groupId: "60000000-0000-4000-8000-000000000001", groupNumber: 1 },
      { groupId: "60000000-0000-4000-8000-000000000002", groupNumber: 2 },
    ],
    "50000000-0000-4000-8000-000000000001",
    "0123456789abcdef0123456789abcdef",
  );

  expect(result.receipts).toEqual([
    {
      groupId: "60000000-0000-4000-8000-000000000001",
      groupNumber: 1,
      joinCode: "HSNY46S4",
      enabled: true,
    },
    {
      groupId: "60000000-0000-4000-8000-000000000002",
      groupNumber: 2,
      joinCode: "KZDLXW4Q",
      enabled: true,
    },
  ]);
  expect(result.persistence).toEqual([
    {
      groupId: "60000000-0000-4000-8000-000000000001",
      codeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    },
    {
      groupId: "60000000-0000-4000-8000-000000000002",
      codeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    },
  ]);
  expect(JSON.stringify(result.persistence)).not.toContain("HSNY46S4");
  expect(result.persistence[0]?.codeHash).not.toBe(result.persistence[1]?.codeHash);
});

it("normalizes the display name and returns no private profile fields", async () => {
  const dependencies = createDependencies();

  const result = await joinStudent(baseInput, dependencies);

  expect(result.identity.nickname).toBe("Explorer 1");
  expect(result.identity).not.toHaveProperty("displayName");
  expect(result.identity).not.toHaveProperty("realName");
  expect(dependencies.createdUsers).toBe(1);
});

it("rejects a malformed group code before creating an Auth user", async () => {
  const dependencies = createDependencies();

  await expect(
    joinStudent({ ...baseInput, joinCode: "10-IO" }, dependencies),
  ).rejects.toMatchObject({ code: "INVALID_REQUEST", status: 400 });
  expect(dependencies.createdUsers).toBe(0);
});

it("rejects a malformed class access ID before creating an Auth user", async () => {
  const dependencies = createDependencies();

  await expect(
    joinStudent({ ...baseInput, classAccessId: "not-a-class-id" }, dependencies),
  ).rejects.toMatchObject({ code: "INVALID_REQUEST", status: 400 });
  expect(dependencies.createdUsers).toBe(0);
});

it.each(["123", "12345", "12a4", "１２３４"])(
  "rejects the non-four-digit passcode %j before creating an Auth user",
  async (passcode) => {
    const dependencies = createDependencies();

    await expect(
      joinStudent({ ...baseInput, passcode }, dependencies),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST", status: 400 });
    expect(dependencies.createdUsers).toBe(0);
  },
);

it("passes class-scoped private credential material and leader intent only to completion", async () => {
  const dependencies = createDependencies();
  const complete = vi.spyOn(dependencies, "completeJoin");

  await joinStudent(baseInput, dependencies);

  expect(complete).toHaveBeenCalledWith({
    classAccessId: baseInput.classAccessId,
    codeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    requestKey: baseInput.requestKey,
    studentId: "20000000-0000-4000-8000-000000000001",
    groupNumber: 4,
    displayName: "Synthetic Learner",
    wantsLeader: true,
    nameLookupHash:
      "b0c3cdb99f2679dace8734b4cbba5541c637555f7268bcda5c2aa6f86d27ee94",
    passcodeSalt: "BwcHBwcHBwcHBwcHBwcHBw",
    passcodeHash: "6bs7_7cRveH4ksIlN8Y-XUXqT69lkI68wQDlqS5wAao",
    passcodeIterations: 210_000,
  });
  expect(JSON.stringify(complete.mock.calls)).not.toContain(baseInput.passcode);
});

it("validates class scope during trusted preparation before creating an Auth user", async () => {
  const dependencies = createDependencies();
  dependencies.prepareJoin = async (_codeHash, _requestKey, classAccessId) => {
    expect(classAccessId).toBe(baseInput.classAccessId);
    throw new JoinBoundaryError("INVALID_JOIN_CODE", 404);
  };

  await expect(joinStudent(baseInput, dependencies)).rejects.toMatchObject({
    code: "INVALID_JOIN_CODE",
    status: 404,
  });
  expect(dependencies.createdUsers).toBe(0);
});

it("requires credential-aware completion before replaying an existing session", async () => {
  const dependencies = createDependencies();
  const identity: StudentIdentity = {
    studentId: "20000000-0000-4000-8000-000000000099",
    cohortId: "40000000-0000-4000-8000-000000000001",
    groupId: "60000000-0000-4000-8000-000000000004",
    groupNumber: 4,
    nickname: "Explorer 1",
    isGroupIdentityEditor: true,
  };
  dependencies.prepareJoin = async () => ({
    completed: { identity },
    groupNumber: identity.groupNumber,
  });
  dependencies.completeJoin = async () => {
    throw new JoinBoundaryError("STUDENT_RECOVERY_REQUIRED", 409);
  };

  await expect(joinStudent(baseInput, dependencies)).rejects.toMatchObject({
    code: "STUDENT_RECOVERY_REQUIRED",
    status: 409,
  });
  expect(dependencies.createdUsers).toBe(0);
});

it("hashes the normalized code before the trusted prepare operation", async () => {
  const dependencies = createDependencies();
  let observedHash = "";
  dependencies.prepareJoin = async (codeHash) => {
    observedHash = codeHash;
    return { completed: null, groupNumber: 4 };
  };

  await joinStudent(baseInput, dependencies);

  expect(observedHash).toMatch(/^[a-f0-9]{64}$/);
  expect(observedHash).not.toContain("FJP5Z8YN");
});

it("runs the trusted replay and preflight preparation before creating an Auth user", async () => {
  const dependencies = createDependencies();
  dependencies.prepareJoin = async () => {
    throw new JoinBoundaryError("GROUP_JOIN_CLOSED", 410);
  };

  await expect(joinStudent(baseInput, dependencies)).rejects.toMatchObject({
    code: "GROUP_JOIN_CLOSED",
    status: 410,
  });
  expect(dependencies.createdUsers).toBe(0);
});

it("uses one trusted preparation call before creating a new identity", async () => {
  const dependencies = createDependencies();
  let preparationCalls = 0;
  dependencies.prepareJoin = async () => {
    preparationCalls += 1;
    return { completed: null, groupNumber: 4 };
  };

  await joinStudent(baseInput, dependencies);

  expect(preparationCalls).toBe(1);
});

it("exchanges the session while the trusted completion is running", async () => {
  const dependencies = createDependencies();
  let completeStarted = false;
  let sessionStarted = false;
  let releaseSession = () => {};
  dependencies.signInNewUser = async () =>
    await new Promise<SessionTokens>((resolve) => {
      sessionStarted = true;
      releaseSession = () => resolve({
        accessToken: "initial-access-token",
        refreshToken: "initial-refresh-token",
      });
    });
  const complete = dependencies.completeJoin.bind(dependencies);
  dependencies.completeJoin = async (input) => {
    completeStarted = true;
    return await complete(input);
  };

  const pending = joinStudent(baseInput, dependencies);
  await vi.waitFor(() => expect(sessionStarted).toBe(true));
  await Promise.resolve();
  try {
    expect(completeStarted).toBe(true);
  } finally {
    releaseSession();
  }
  await expect(pending).resolves.toMatchObject({
    accessToken: "initial-access-token",
  });
});

it("keeps a completed identity when initial session exchange fails", async () => {
  const dependencies = createDependencies();
  dependencies.signInNewUser = async () => {
    throw new Error("session exchange unavailable");
  };

  await expect(joinStudent(baseInput, dependencies)).resolves.toMatchObject({
    accessToken: "replacement-access-token",
  });
  expect(dependencies.deletedUsers).toBe(0);
  expect(dependencies.stored.size).toBe(1);
});

it("returns the safe invalid-code error from the trusted boundary", async () => {
  const dependencies = createDependencies();
  dependencies.findCompletedJoin = async () => null;
  dependencies.prepareJoin = async () => {
    throw new JoinBoundaryError("INVALID_JOIN_CODE", 404);
  };

  await expect(joinStudent(baseInput, dependencies)).rejects.toMatchObject({
    code: "INVALID_JOIN_CODE",
    status: 404,
  });
});

it("allows exactly one concurrent claim for the last group place", async () => {
  const dependencies = createDependencies(1);

  const results = await Promise.allSettled([
    joinStudent(baseInput, dependencies),
    joinStudent(
      {
        ...baseInput,
        requestKey: "50000000-0000-4000-8000-000000000002",
      },
      dependencies,
    ),
  ]);

  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  expect(dependencies.remainingCapacity).toBe(0);
});

it("replays a completed request without creating another identity", async () => {
  const dependencies = createDependencies();

  const first = await joinStudent(baseInput, dependencies);
  const replay = await joinStudent(baseInput, dependencies);

  expect(replay.identity).toEqual(first.identity);
  expect(replay.accessToken).toBe("replacement-access-token");
  expect(dependencies.createdUsers).toBe(1);
});

it("reconciles an ambiguous completion response before deleting the Auth user", async () => {
  const dependencies = createDependencies();
  const complete = dependencies.completeJoin.bind(dependencies);
  dependencies.completeJoin = async (input) => {
    await complete(input);
    throw new Error("connection closed after commit");
  };

  const result = await joinStudent(baseInput, dependencies);

  expect(result.identity.studentId).toBe(
    "20000000-0000-4000-8000-000000000001",
  );
  expect(dependencies.deletedUsers).toBe(0);
});

it("does not disclose internal join failures such as name collisions", async () => {
  const dependencies = createDependencies();
  dependencies.completeJoin = async () => {
    throw new Error("duplicate display_name");
  };

  await expect(joinStudent(baseInput, dependencies)).rejects.toMatchObject({
    code: "JOIN_NOT_AVAILABLE",
    status: 409,
  });
  expect(dependencies.deletedUsers).toBe(1);
});

it("audits a synthetic identity when Auth cleanup fails", async () => {
  const dependencies = createDependencies();
  let orphanedStudentId = "";
  dependencies.completeJoin = async () => {
    throw new Error("database unavailable");
  };
  dependencies.deleteSyntheticUser = async () => {
    throw new Error("auth cleanup unavailable");
  };
  dependencies.recordOrphanedIdentity = async (studentId) => {
    orphanedStudentId = studentId;
  };

  await expect(joinStudent(baseInput, dependencies)).rejects.toMatchObject({
    code: "JOIN_NOT_AVAILABLE",
  });
  expect(orphanedStudentId).toBe(
    "20000000-0000-4000-8000-000000000001",
  );
});
