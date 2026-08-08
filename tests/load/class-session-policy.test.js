import { describe, expect, it } from "vitest";
import {
  buildJoinPhaseEvidence,
  classroomLoadGateFailures,
} from "./class-session-policy.js";

function passingMetrics(overrides = {}) {
  return {
    authorizedFailures: 0,
    unauthorizedAccepted: 0,
    studentsJoined: 30,
    failedJoins: 0,
    incorrectGroupAssignments: 0,
    duplicateStudentIdentities: 0,
    p95JoinMs: 4_999,
    p95ResponseMs: 1_499,
    p95DashboardMs: 2_499,
    duplicateResponses: 0,
    completedStudents: 30,
    groups: 5,
    groupsWithValidScores: 5,
    students: 30,
    studentsWithVerifiedFormula: 30,
    ...overrides,
  };
}

describe("classroom join readiness evidence", () => {
  it("reports aggregate join integrity and latency without student records", () => {
    const evidence = buildJoinPhaseEvidence({
      authorizedFailures: 0,
      joinLatencies: Array.from({ length: 28 }, () => 100).concat(4_999, 4_999),
      joinStageLatencies: {
        find: [20],
        preflight: [30],
        create: [40],
        sign: [50],
        complete: [60],
      },
      joinedStudents: [
        { studentId: "student-a", expectedGroupNumber: 1, actualGroupNumber: 1 },
        { studentId: "student-b", expectedGroupNumber: 2, actualGroupNumber: 1 },
        { studentId: "student-a", expectedGroupNumber: 3, actualGroupNumber: 3 },
      ],
    });

    expect(evidence).toEqual({
      authorizedFailures: 0,
      studentsJoined: 3,
      failedJoins: 27,
      incorrectGroupAssignments: 1,
      duplicateStudentIdentities: 1,
      p95JoinMs: 4_999,
      p95JoinFindMs: 20,
      p95JoinPreflightMs: 30,
      p95JoinCreateMs: 40,
      p95JoinSignMs: 50,
      p95JoinCompleteMs: 60,
    });
    expect(JSON.stringify(evidence)).not.toContain("student-a");
  });
});

describe("classroom load release gate", () => {
  it("accepts a fully correct 30-student run below the 5-second join limit", () => {
    expect(classroomLoadGateFailures(passingMetrics())).toEqual([]);
  });

  it("rejects a join p95 at the 5-second boundary", () => {
    expect(classroomLoadGateFailures(passingMetrics({ p95JoinMs: 5_000 })))
      .toContain("p95JoinMs");
  });

  it.each([
    ["failed authorized request", { authorizedFailures: 1 }, "authorizedFailures"],
    ["missing student", { studentsJoined: 29 }, "studentsJoined"],
    ["failed join", { failedJoins: 1 }, "failedJoins"],
    ["incorrect group", { incorrectGroupAssignments: 1 }, "incorrectGroupAssignments"],
    ["duplicate identity", { duplicateStudentIdentities: 1 }, "duplicateStudentIdentities"],
    ["accepted anonymous request", { unauthorizedAccepted: 1 }, "unauthorizedAccepted"],
    ["slow response", { p95ResponseMs: 1_500 }, "p95ResponseMs"],
    ["slow dashboard", { p95DashboardMs: 2_500 }, "p95DashboardMs"],
    ["duplicate response", { duplicateResponses: 1 }, "duplicateResponses"],
    ["incomplete student", { completedStudents: 29 }, "completedStudents"],
    ["missing group", { groups: 4 }, "groups"],
    ["invalid group score", { groupsWithValidScores: 4 }, "groupsWithValidScores"],
    ["wrong class size", { students: 29 }, "students"],
    ["invalid score formula", { studentsWithVerifiedFormula: 29 }, "studentsWithVerifiedFormula"],
  ])("rejects %s", (_label, overrides, expectedFailure) => {
    expect(classroomLoadGateFailures(passingMetrics(overrides)))
      .toContain(expectedFailure);
  });
});
