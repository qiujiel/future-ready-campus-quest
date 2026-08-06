import type {
  ClassroomReadinessReport,
  ConceptAggregate,
  ConceptId,
  EvidenceCounts,
  TeacherReadinessGroup,
  TeacherDashboardSummary,
} from "../../../src/shared/api/contracts.ts";
import { deriveGroupJoinCode } from "./join-core.ts";

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

export interface TrustedReadinessReport extends Omit<
  ClassroomReadinessReport,
  "joining" | "groups"
> {
  joining: {
    open: boolean;
    joinWindowId: string | null;
    requestKey: string | null;
    expiresAt: string | null;
  };
  groups: Array<Omit<TeacherReadinessGroup, "joinCode">>;
}

export async function prepareClassroomReadiness(
  report: TrustedReadinessReport,
  signingSecret: string,
  studentUrl: string,
): Promise<ClassroomReadinessReport> {
  const requestKey = report.joining.open
    ? report.joining.requestKey
    : null;
  const groups = await Promise.all(
    report.groups.map(async (group) => ({
      ...group,
      joinCode:
        requestKey && group.joinEnabled
          ? await deriveGroupJoinCode(
            requestKey,
            group.groupNumber,
            signingSecret,
          )
          : null,
    })),
  );

  return {
    cohortId: report.cohortId,
    title: report.title,
    expected: report.expected,
    joined: report.joined,
    active: report.active,
    started: report.started,
    submitted: report.submitted,
    incomplete: report.incomplete,
    errors: report.errors,
    joining: {
      open: report.joining.open,
      expiresAt: report.joining.expiresAt,
      studentUrl,
    },
    groups,
  };
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
