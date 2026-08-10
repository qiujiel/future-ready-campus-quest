import { describe, expect, it, vi } from "vitest";
import type {
  StudentLoginInput,
  StudentIdentity,
} from "../../src/shared/api/contracts";
import {
  loginStudent,
  type StudentLoginCandidate,
  type StudentLoginDependencies,
} from "../functions/_shared/student-login-core";

const validInput: StudentLoginInput = {
  classAccessId: "40000000-0000-4000-8000-000000000099",
  displayName: "Alex Tan",
  passcode: "4826",
  requestKey: "50000000-0000-4000-8000-000000000001",
};

function storedCandidate(
  studentId: string,
  passcode: string,
): StudentLoginCandidate {
  return {
    studentId,
    credential: {
      salt: "fixture",
      hash: `match-${passcode}`,
      iterations: 210_000,
    },
  };
}

function studentIdentity(studentId = "student-1"): StudentIdentity {
  return {
    studentId,
    cohortId: "cohort-1",
    groupId: "group-1",
    groupNumber: 1,
    nickname: "Explorer 1",
    isGroupIdentityEditor: false,
  };
}

function dependencies(options: { candidates: StudentLoginCandidate[] }) {
  const events: string[] = [];
  const dependency: StudentLoginDependencies = {
    beginAttempt: vi.fn(async () => {
      events.push("begin");
      return {
        attemptId: "70000000-0000-4000-8000-000000000001",
        candidates: options.candidates,
      };
    }),
    verifyPasscode: vi.fn(async (passcode, credential) => {
      events.push(`verify:${credential.hash}`);
      return credential.hash === `match-${passcode}`;
    }),
    dummyCredential: {
      salt: "dummy",
      hash: "match-never",
      iterations: 210_000,
    },
    finishAttempt: vi.fn(async (_attemptId, succeeded, studentId) => {
      events.push(`finish:${succeeded}:${studentId ?? "none"}`);
    }),
    async loadIdentity(studentId) {
      events.push("identity");
      return studentIdentity(studentId);
    },
    async issueSession() {
      events.push("session");
      return {
        accessToken: "replacement-access",
        refreshToken: "replacement-refresh",
      };
    },
  };
  return { dependency, events };
}

describe("returning student login", () => {
  it("issues a replacement session only for one matching active candidate", async () => {
    const { dependency, events } = dependencies({
      candidates: [storedCandidate("student-1", "4826")],
    });

    const result = await loginStudent(validInput, dependency);

    expect(result).toMatchObject({
      identity: { studentId: "student-1", groupNumber: 1 },
      accessToken: "replacement-access",
    });
    expect(dependency.finishAttempt).toHaveBeenCalledWith(
      "70000000-0000-4000-8000-000000000001",
      true,
      "student-1",
    );
    expect(events.indexOf("finish:true:student-1")).toBeLessThan(
      events.indexOf("session"),
    );
  });

  it.each([
    ["unknown name", []],
    ["wrong passcode", [storedCandidate("student-1", "1111")]],
    [
      "ambiguous duplicate",
      [
        storedCandidate("student-1", "4826"),
        storedCandidate("student-2", "4826"),
      ],
    ],
  ])("returns the same neutral failure for %s", async (_label, candidates) => {
    const { dependency } = dependencies({ candidates });

    await expect(loginStudent(validInput, dependency)).rejects.toMatchObject({
      code: "STUDENT_LOGIN_NOT_ACCEPTED",
      status: 401,
      message: "STUDENT_LOGIN_NOT_ACCEPTED",
    });
    expect(dependency.finishAttempt).toHaveBeenCalledWith(
      "70000000-0000-4000-8000-000000000001",
      false,
    );
    expect(dependency.verifyPasscode).toHaveBeenCalled();
  });

  it("uses the dummy credential when the name has no active candidates", async () => {
    const { dependency } = dependencies({ candidates: [] });

    await expect(loginStudent(validInput, dependency)).rejects.toMatchObject({
      code: "STUDENT_LOGIN_NOT_ACCEPTED",
    });
    expect(dependency.verifyPasscode).toHaveBeenCalledWith(
      validInput.passcode,
      dependency.dummyCredential,
    );
  });

  it("uses the dummy credential when trusted preparation rejects the lookup", async () => {
    const { dependency } = dependencies({ candidates: [] });
    dependency.beginAttempt = vi.fn(async () => {
      throw new Error("trusted lookup rejected");
    });

    await expect(loginStudent(validInput, dependency)).rejects.toMatchObject({
      code: "STUDENT_LOGIN_NOT_ACCEPTED",
      status: 401,
    });
    expect(dependency.verifyPasscode).toHaveBeenCalledWith(
      validInput.passcode,
      dependency.dummyCredential,
    );
    expect(dependency.finishAttempt).not.toHaveBeenCalled();
  });

  it("normalizes the name and canonicalizes the validated class access ID", async () => {
    const { dependency } = dependencies({ candidates: [] });
    const beginAttempt = vi.spyOn(dependency, "beginAttempt");

    await expect(loginStudent({
      ...validInput,
      classAccessId: "A0000000-0000-4000-8000-000000000099",
      displayName: "  Alex   Tan  ",
    }, dependency)).rejects.toMatchObject({
      code: "STUDENT_LOGIN_NOT_ACCEPTED",
    });
    expect(beginAttempt).toHaveBeenCalledWith(
      "a0000000-0000-4000-8000-000000000099",
      "Alex Tan",
      validInput.requestKey,
    );
  });

  it.each([
    ["malformed class", { classAccessId: "not-a-uuid" }],
    ["empty normalized name", { displayName: "   \n  " }],
    ["long normalized name", { displayName: "a".repeat(101) }],
    ["non-numeric passcode", { passcode: "48x6" }],
    ["malformed request key", { requestKey: "not-a-uuid" }],
  ])("rejects %s before beginning a database attempt", async (_label, change) => {
    const { dependency } = dependencies({ candidates: [] });

    await expect(loginStudent({ ...validInput, ...change }, dependency))
      .rejects.toMatchObject({ code: "INVALID_REQUEST", status: 400 });
    expect(dependency.beginAttempt).not.toHaveBeenCalled();
  });

  it("never includes raw credentials in a thrown login failure", async () => {
    const { dependency } = dependencies({ candidates: [] });

    const error = await loginStudent(validInput, dependency).catch(
      (caught: unknown) => caught,
    );
    const serialized = JSON.stringify(error, Object.getOwnPropertyNames(error));
    expect(serialized).not.toContain(validInput.displayName);
    expect(serialized).not.toContain(validInput.passcode);
  });

  it("does not load identity or issue a session if success finalization fails", async () => {
    const { dependency, events } = dependencies({
      candidates: [storedCandidate("student-1", "4826")],
    });
    dependency.finishAttempt = async () => {
      events.push("finish-error");
      throw new Error("trusted finalization rejected");
    };

    await expect(loginStudent(validInput, dependency)).rejects.toMatchObject({
      code: "STUDENT_LOGIN_NOT_ACCEPTED",
      status: 401,
    });
    expect(events).not.toContain("identity");
    expect(events).not.toContain("session");
  });
});
