import type {
  ConceptAggregate,
  ConceptId,
  EvidenceCounts,
  TeacherDashboardSummary,
} from "../../../src/shared/api/contracts.ts";

const conceptIds: readonly ConceptId[] = [
  "C1",
  "C2",
  "C3",
  "C4",
  "C5",
  "C6",
  "C7",
  "C8",
];

const emptyCounts = (): EvidenceCounts => ({
  needs_support: 0,
  developing: 0,
  secure: 0,
});

const emptyConceptAggregate = (conceptId: ConceptId): ConceptAggregate => ({
  conceptId,
  first: emptyCounts(),
  final: emptyCounts(),
  retryCorrect: 0,
  retryAttempted: 0,
});

export class TeacherDashboardBoundaryError extends Error {
  constructor(
    public readonly code: "COHORT_NOT_AVAILABLE",
    public readonly status: 404,
  ) {
    super(code);
    this.name = "TeacherDashboardBoundaryError";
  }
}

export interface TeacherDashboardRepository {
  loadOwnedSummary(
    actorUserId: string,
    cohortId: string,
  ): Promise<TeacherDashboardSummary | null>;
}

export async function loadTeacherDashboard(
  actorUserId: string | null,
  cohortId: string,
  repository: TeacherDashboardRepository,
): Promise<TeacherDashboardSummary> {
  if (!actorUserId) {
    throw new TeacherDashboardBoundaryError("COHORT_NOT_AVAILABLE", 404);
  }

  const summary = await repository.loadOwnedSummary(actorUserId, cohortId);
  if (!summary) {
    throw new TeacherDashboardBoundaryError("COHORT_NOT_AVAILABLE", 404);
  }

  const aggregatesByConcept = new Map(
    summary.conceptAggregates.map((aggregate) => [
      aggregate.conceptId,
      aggregate,
    ]),
  );

  return {
    ...summary,
    conceptAggregates: conceptIds.map(
      (conceptId) =>
        aggregatesByConcept.get(conceptId) ??
        emptyConceptAggregate(conceptId),
    ),
    mostMissed: [...summary.mostMissed].sort(
      (left, right) =>
        right.incorrectCount - left.incorrectCount ||
        left.conceptId.localeCompare(right.conceptId) ||
        left.itemId.localeCompare(right.itemId),
    ),
  };
}
