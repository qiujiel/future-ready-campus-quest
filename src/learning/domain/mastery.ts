import type { SupportState } from "../../shared/api/contracts";
import type {
  EvidenceCount,
  MasteryEstimate,
  MasteryEvidence,
} from "./types";

const phaseWeights = {
  diagnostic: 1,
  mission: 2,
  final: 3,
} as const;

function validateEvidence({ correct, total }: EvidenceCount): void {
  if (
    !Number.isFinite(correct) ||
    !Number.isFinite(total) ||
    correct < 0 ||
    total < 0
  ) {
    throw new Error("Evidence counts must be finite, non-negative numbers.");
  }
  if (correct > total) {
    throw new Error("Correct responses cannot exceed total responses.");
  }
}

export function classifyConcept(evidence: EvidenceCount): SupportState {
  validateEvidence(evidence);
  if (evidence.total === 0 || evidence.correct * 100 < evidence.total * 50) {
    return "needs_support";
  }
  if (evidence.correct * 100 < evidence.total * 80) {
    return "developing";
  }
  return "secure";
}

export function estimateMastery(evidence: MasteryEvidence): MasteryEstimate {
  const phases = [
    ["diagnostic", evidence.diagnostic],
    ["mission", evidence.mission],
    ["final", evidence.final],
  ] as const;

  let weightedCorrect = 0;
  let weightedTotal = 0;
  for (const [phase, counts] of phases) {
    validateEvidence(counts);
    weightedCorrect += counts.correct * phaseWeights[phase];
    weightedTotal += counts.total * phaseWeights[phase];
  }

  if (evidence.retry) validateEvidence(evidence.retry);

  const value =
    weightedTotal === 0
      ? 0
      : Math.round((weightedCorrect / weightedTotal) * 100);
  const result: MasteryEstimate = {
    value,
    state: classifyConcept({
      correct: weightedCorrect,
      total: weightedTotal,
    }),
  };

  return evidence.retry ? { ...result, retry: evidence.retry } : result;
}
