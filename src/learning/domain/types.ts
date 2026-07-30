import type { SupportState } from "../../shared/api/contracts";

export interface EvidenceCount {
  correct: number;
  total: number;
}

export interface MasteryEvidence {
  diagnostic: EvidenceCount;
  mission: EvidenceCount;
  final: EvidenceCount;
  retry?: EvidenceCount;
}

export interface MasteryEstimate {
  value: number;
  state: SupportState;
  retry?: EvidenceCount;
}

export interface TeamScoreParts {
  finalMastery: number | null;
  improvement: number | null;
  missionCompletion: number | null;
  reflection: number | null;
}

export interface ImprovementInput {
  diagnosticCorrect: number;
  finalCorrect: number;
  conceptCount: number;
}
