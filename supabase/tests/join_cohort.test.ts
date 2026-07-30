import {
  createJoinWindowToken,
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
  joinToken: "shared-class-token-with-sufficient-entropy",
  groupNumber: 1,
  realName: "  Synthetic   Learner  ",
  nickname: "  Bright   Comet ",
  privacyConfirmed: true,
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
    async findCompletedJoin(tokenHash, requestKey) {
      return stored.get(`${tokenHash}:${requestKey}`) ?? null;
    },
    async createSyntheticUser() {
      this.createdUsers += 1;
      const studentId = `20000000-0000-4000-8000-${String(nextStudent).padStart(12, "0")}`;
      nextStudent += 1;
      return {
        studentId,
        internalEmail: `${studentId}@students.invalid`,
        password: "server-generated-password-that-is-never-persisted",
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
      const key = `${input.tokenHash}:${input.requestKey}`;
      const existing = stored.get(key);
      if (existing) return existing.identity;
      if (remainingCapacity < 1) {
        throw new JoinBoundaryError("GROUP_FULL", 409);
      }

      remainingCapacity -= 1;
      const identity: StudentIdentity = {
        studentId: input.studentId,
        cohortId: "40000000-0000-4000-8000-000000000001",
        groupId: "60000000-0000-4000-8000-000000000001",
        groupNumber: input.groupNumber,
        nickname: input.nickname ?? "Explorer 1",
        isGroupIdentityEditor: remainingCapacity === capacity - 1,
      };
      stored.set(key, { identity });
      return identity;
    },
    async deleteSyntheticUser() {
      this.deletedUsers += 1;
    },
  };
}

it("opens a high-entropy join window for exactly 15 minutes", async () => {
  const openedAt = new Date("2026-07-30T05:00:00.000Z");

  const result = await createJoinWindowToken(openedAt);

  expect(result.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(result.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  expect(result.expiresAt).toBe("2026-07-30T05:15:00.000Z");
  expect(result.tokenHash).not.toContain(result.rawToken);
});

it("normalizes names and returns no private profile fields", async () => {
  const dependencies = createDependencies();

  const result = await joinStudent(baseInput, dependencies);

  expect(result.identity.nickname).toBe("Bright Comet");
  expect(result.identity).not.toHaveProperty("realName");
  expect(dependencies.createdUsers).toBe(1);
});

it("rejects an invalid group before creating an Auth user", async () => {
  const dependencies = createDependencies();

  await expect(
    joinStudent({ ...baseInput, groupNumber: 0 }, dependencies),
  ).rejects.toMatchObject({ code: "INVALID_REQUEST", status: 400 });
  expect(dependencies.createdUsers).toBe(0);
});

it("returns the safe expired-window error from the trusted boundary", async () => {
  const dependencies = createDependencies();
  dependencies.findCompletedJoin = async () => {
    throw new JoinBoundaryError("JOIN_WINDOW_CLOSED", 410);
  };

  await expect(joinStudent(baseInput, dependencies)).rejects.toMatchObject({
    code: "JOIN_WINDOW_CLOSED",
    status: 410,
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
    throw new Error("duplicate real_name");
  };

  await expect(joinStudent(baseInput, dependencies)).rejects.toMatchObject({
    code: "JOIN_NOT_AVAILABLE",
    status: 409,
  });
  expect(dependencies.deletedUsers).toBe(1);
});
