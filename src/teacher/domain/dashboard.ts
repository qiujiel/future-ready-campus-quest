import type {
  EvidenceCounts,
} from "../../shared/api/contracts";

export type HeatmapIntensity = "none" | "low" | "medium" | "high";

export interface DashboardTeamRankEntry {
  groupId: string;
  groupNumber: number;
  score: number | null;
}

export type RankedDashboardTeam<T extends DashboardTeamRankEntry> = T & {
  rank: number | null;
};

export function evidencePercentage(counts: EvidenceCounts): number | null {
  const total =
    counts.needs_support + counts.developing + counts.secure;
  if (total === 0) return null;
  return Math.round((counts.secure / total) * 100);
}

export function heatmapIntensity(
  counts: EvidenceCounts,
): HeatmapIntensity {
  const percentage = evidencePercentage(counts);
  if (percentage === null) return "none";
  if (percentage < 40) return "low";
  if (percentage < 70) return "medium";
  return "high";
}

export function rankDashboardTeams<T extends DashboardTeamRankEntry>(
  entries: readonly T[],
): Array<RankedDashboardTeam<T>> {
  const completed = entries
    .filter(
      (entry): entry is T & { score: number } =>
        entry.score !== null,
    )
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.groupNumber - right.groupNumber,
    );
  const incomplete = entries
    .filter((entry) => entry.score === null)
    .sort((left, right) => left.groupNumber - right.groupNumber);

  let previousScore: number | undefined;
  let currentRank = 0;
  const ranked = completed.map((entry, index) => {
    if (entry.score !== previousScore) currentRank = index + 1;
    previousScore = entry.score;
    return { ...entry, rank: currentRank };
  });

  return [
    ...ranked,
    ...incomplete.map((entry) => ({ ...entry, rank: null })),
  ];
}

export function emptyDashboardLabel(counts: {
  enrolled: number;
  active: number;
  completed: number;
}): string {
  if (counts.enrolled === 0) {
    return "No students have joined this cohort yet.";
  }
  if (counts.completed === counts.enrolled) {
    return "This cohort has completed the quest.";
  }
  return "Learning evidence is arriving.";
}
