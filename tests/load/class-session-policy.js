const classroomStudentCount = 30;
const classroomGroupCount = 5;

export const CLASSROOM_JOIN_P95_LIMIT_MS = 5_000;
export const CLASSROOM_RESPONSE_P95_LIMIT_MS = 1_500;
export const CLASSROOM_DASHBOARD_P95_LIMIT_MS = 2_500;

function percentile(values, percentileValue) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil((percentileValue / 100) * sorted.length) - 1] ?? 0;
}

export function buildJoinPhaseEvidence({
  authorizedFailures,
  joinLatencies,
  joinStageLatencies,
  joinedStudents,
}) {
  const studentIds = joinedStudents.map((student) => student.studentId);
  return {
    authorizedFailures,
    studentsJoined: joinedStudents.length,
    failedJoins: classroomStudentCount - joinedStudents.length,
    incorrectGroupAssignments: joinedStudents.filter(
      (student) => student.actualGroupNumber !== student.expectedGroupNumber,
    ).length,
    duplicateStudentIdentities:
      studentIds.length - new Set(studentIds).size,
    p95JoinMs: percentile(joinLatencies, 95),
    p95JoinFindMs: percentile(joinStageLatencies.find, 95),
    p95JoinPreflightMs: percentile(joinStageLatencies.preflight, 95),
    p95JoinCreateMs: percentile(joinStageLatencies.create, 95),
    p95JoinSignMs: percentile(joinStageLatencies.sign, 95),
    p95JoinCompleteMs: percentile(joinStageLatencies.complete, 95),
  };
}

export function classroomLoadGateFailures(metrics) {
  return [
    ["authorizedFailures", metrics.authorizedFailures === 0],
    ["unauthorizedAccepted", metrics.unauthorizedAccepted === 0],
    ["studentsJoined", metrics.studentsJoined === classroomStudentCount],
    ["failedJoins", metrics.failedJoins === 0],
    ["incorrectGroupAssignments", metrics.incorrectGroupAssignments === 0],
    ["duplicateStudentIdentities", metrics.duplicateStudentIdentities === 0],
    [
      "p95JoinMs",
      Number.isFinite(metrics.p95JoinMs) &&
        metrics.p95JoinMs <= CLASSROOM_JOIN_P95_LIMIT_MS,
    ],
    [
      "p95ResponseMs",
      Number.isFinite(metrics.p95ResponseMs) &&
        metrics.p95ResponseMs < CLASSROOM_RESPONSE_P95_LIMIT_MS,
    ],
    [
      "p95DashboardMs",
      Number.isFinite(metrics.p95DashboardMs) &&
        metrics.p95DashboardMs < CLASSROOM_DASHBOARD_P95_LIMIT_MS,
    ],
    ["duplicateResponses", metrics.duplicateResponses === 0],
    ["completedStudents", metrics.completedStudents === classroomStudentCount],
    ["groups", metrics.groups === classroomGroupCount],
    ["groupsWithValidScores", metrics.groupsWithValidScores === classroomGroupCount],
    ["students", metrics.students === classroomStudentCount],
    [
      "studentsWithVerifiedFormula",
      metrics.studentsWithVerifiedFormula === classroomStudentCount,
    ],
    ["returningLogins", metrics.returningLogins === 5],
    ["failedReturningLogins", metrics.failedReturningLogins === 0],
    [
      "returningIdentityMismatches",
      metrics.returningIdentityMismatches === 0,
    ],
    [
      "authIdentitiesCreatedByLogin",
      metrics.authIdentitiesCreatedByLogin === 0,
    ],
  ].filter(([, passed]) => !passed).map(([field]) => field);
}
