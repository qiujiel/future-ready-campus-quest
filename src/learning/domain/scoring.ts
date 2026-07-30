import type { ImprovementInput, TeamScoreParts } from "./types";

export interface TeamScoreEntry {
  groupId: string;
  groupNumber: number;
  score: number | null;
}

export interface RankedTeamScore extends TeamScoreEntry {
  rank: number | null;
}

function boundedPercentage(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error("Score components must be finite numbers.");
  }
  return Math.max(0, Math.min(100, value));
}

export function teamScore(parts: TeamScoreParts): number | null {
  const values = [
    parts.finalMastery,
    parts.improvement,
    parts.missionCompletion,
    parts.reflection,
  ];
  if (values.some((value) => value === null)) return null;

  return Math.round(
    boundedPercentage(parts.finalMastery as number) * 0.6 +
      boundedPercentage(parts.improvement as number) * 0.25 +
      boundedPercentage(parts.missionCompletion as number) * 0.1 +
      boundedPercentage(parts.reflection as number) * 0.05,
  );
}

export function normalizedImprovement({
  diagnosticCorrect,
  finalCorrect,
  conceptCount,
}: ImprovementInput): number {
  if (
    !Number.isInteger(diagnosticCorrect) ||
    !Number.isInteger(finalCorrect) ||
    !Number.isInteger(conceptCount) ||
    conceptCount <= 0 ||
    diagnosticCorrect < 0 ||
    finalCorrect < 0 ||
    diagnosticCorrect > conceptCount ||
    finalCorrect > conceptCount
  ) {
    throw new Error("Improvement counts must fit the concept count.");
  }

  if (diagnosticCorrect === conceptCount) {
    return finalCorrect === conceptCount ? 100 : 0;
  }

  const gained = Math.max(0, finalCorrect - diagnosticCorrect);
  return Math.round((gained / (conceptCount - diagnosticCorrect)) * 100);
}

export function rankTeamScores(
  entries: readonly TeamScoreEntry[],
): RankedTeamScore[] {
  const completed = entries
    .filter(
      (entry): entry is TeamScoreEntry & { score: number } =>
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

export type { ImprovementInput, TeamScoreParts } from "./types";
