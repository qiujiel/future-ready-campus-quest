import {
  TeacherDashboardBoundaryError,
  loadTeacherDashboard,
  type TeacherDashboardRepository,
} from "../functions/_shared/teacher-dashboard-core";
import type { TeacherDashboardSummary } from "../../src/shared/api/contracts";

const cohortId = "c1000000-0000-4000-8000-000000000001";
const teacherId = "c2000000-0000-4000-8000-000000000001";

function summary(): TeacherDashboardSummary {
  return {
    cohortId,
    enrolled: 6,
    active: 2,
    completed: 4,
    conceptAggregates: [
      {
        conceptId: "C3",
        first: { needs_support: 2, developing: 2, secure: 2 },
        final: { needs_support: 1, developing: 1, secure: 4 },
        retryCorrect: 1,
        retryAttempted: 2,
      },
    ],
    mostMissed: [
      {
        itemId: "item-low",
        conceptId: "C2",
        shortLabel: "C2 final check",
        incorrectCount: 2,
        responseCount: 6,
        misconceptionTags: [{ tag: "tool-first", count: 2 }],
      },
      {
        itemId: "item-high",
        conceptId: "C1",
        shortLabel: "C1 final check",
        incorrectCount: 5,
        responseCount: 6,
        misconceptionTags: [{ tag: "purpose-missing", count: 4 }],
      },
    ],
    teamScores: [
      {
        groupId: "g1",
        groupNumber: 1,
        displayName: "Future Makers",
        score: null,
        completedMembers: 3,
        enrolledMembers: 6,
      },
    ],
    generatedAt: "2030-01-01T09:00:00.000Z",
  };
}

function repository(
  value: TeacherDashboardSummary | null,
): TeacherDashboardRepository {
  return {
    async loadOwnedSummary() {
      return value;
    },
  };
}

it("normalizes all eight concept rows and orders most-missed items", async () => {
  const result = await loadTeacherDashboard(
    teacherId,
    cohortId,
    repository(summary()),
  );

  expect(result.conceptAggregates.map((row) => row.conceptId)).toEqual([
    "C1",
    "C2",
    "C3",
    "C4",
    "C5",
    "C6",
    "C7",
    "C8",
  ]);
  expect(result.conceptAggregates[0]).toEqual({
    conceptId: "C1",
    first: { needs_support: 0, developing: 0, secure: 0 },
    final: { needs_support: 0, developing: 0, secure: 0 },
    retryCorrect: 0,
    retryAttempted: 0,
  });
  expect(result.mostMissed.map((item) => item.itemId)).toEqual([
    "item-high",
    "item-low",
  ]);
  expect(result.teamScores[0]?.score).toBeNull();
});

it.each([
  ["second teacher", "c2000000-0000-4000-8000-000000000002"],
  ["student", "c3000000-0000-4000-8000-000000000001"],
  ["anonymous caller", null],
])("returns one neutral denial for a %s", async (_label, actorId) => {
  await expect(
    loadTeacherDashboard(actorId, cohortId, repository(null)),
  ).rejects.toEqual(
    new TeacherDashboardBoundaryError("COHORT_NOT_AVAILABLE", 404),
  );
});
