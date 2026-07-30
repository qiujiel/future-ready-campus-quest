import {
  normalizedImprovement,
  teamScore,
} from "../../../src/learning/domain/scoring.ts";
import type {
  ConceptId,
  LearningPhase,
} from "../../../src/shared/api/contracts.ts";
import type { EvidenceCount } from "../../../src/learning/domain/types.ts";

export type ReflectionChoice = "apply" | "discuss" | "revisit";

export interface QuestCompletionInput {
  attemptId: string;
  idempotencyKey: string;
  reflectionChoice: ReflectionChoice;
  reflectionNote?: string;
}

export interface CompletionEvidence {
  ownerStudentId: string;
  currentPhase: LearningPhase;
  diagnostic: EvidenceCount;
  mission: {
    completed: number;
    assigned: number;
  };
  final: EvidenceCount;
  retry: EvidenceCount;
  retryConceptIds: ConceptId[];
  finalMisconceptionConceptIds: ConceptId[];
}

export interface QuestCompletionRecord {
  attemptId: string;
  idempotencyKey: string;
  diagnostic: EvidenceCount;
  final: EvidenceCount;
  retry: EvidenceCount;
  retryFormative: true;
  finalMastery: number;
  improvement: number;
  missionCompletion: number;
  reflectionCompletion: 100;
  individualContribution: number;
  formulaVersion: "team-score-60-25-10-5-v1";
  reflectionChoice: ReflectionChoice;
  reflectionNote: string | null;
  reflectionPromptConceptId: ConceptId;
}

export interface CompletionRepository {
  findCompletedAttempt(
    attemptId: string,
    idempotencyKey: string,
  ): Promise<QuestCompletionRecord | null>;
  loadEvidence(attemptId: string): Promise<CompletionEvidence | null>;
  saveCompletion(
    record: QuestCompletionRecord,
  ): Promise<QuestCompletionRecord>;
}

export class CompletionBoundaryError extends Error {
  constructor(
    public readonly code:
      | "INVALID_COMPLETION"
      | "ATTEMPT_NOT_AVAILABLE"
      | "FINAL_INCOMPLETE"
      | "RETRY_TARGET_INVALID",
    public readonly status: number,
  ) {
    super(code);
  }
}

function percentage(completed: number, assigned: number): number {
  if (assigned === 0) return 100;
  return Math.round((completed / assigned) * 100);
}

function validatedNote(note: string | undefined): string | null {
  if (note === undefined) return null;
  const trimmed = note.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 240) {
    throw new CompletionBoundaryError("INVALID_COMPLETION", 400);
  }
  return trimmed;
}

export async function completeQuest(
  actorStudentId: string,
  input: QuestCompletionInput,
  repository: CompletionRepository,
): Promise<QuestCompletionRecord> {
  if (
    !input.attemptId ||
    !input.idempotencyKey ||
    !["apply", "discuss", "revisit"].includes(input.reflectionChoice)
  ) {
    throw new CompletionBoundaryError("INVALID_COMPLETION", 400);
  }

  const replay = await repository.findCompletedAttempt(
    input.attemptId,
    input.idempotencyKey,
  );
  if (replay) return replay;

  const evidence = await repository.loadEvidence(input.attemptId);
  if (
    !evidence ||
    evidence.ownerStudentId !== actorStudentId ||
    !["retry", "reflection"].includes(evidence.currentPhase)
  ) {
    throw new CompletionBoundaryError("ATTEMPT_NOT_AVAILABLE", 404);
  }
  if (evidence.final.total !== 8) {
    throw new CompletionBoundaryError("FINAL_INCOMPLETE", 409);
  }
  if (
    evidence.retryConceptIds.some(
      (conceptId) =>
        !evidence.finalMisconceptionConceptIds.includes(conceptId),
    )
  ) {
    throw new CompletionBoundaryError("RETRY_TARGET_INVALID", 409);
  }

  const finalMastery = percentage(
    evidence.final.correct,
    evidence.final.total,
  );
  const improvement = normalizedImprovement({
    diagnosticCorrect: evidence.diagnostic.correct,
    finalCorrect: evidence.final.correct,
    conceptCount: 8,
  });
  const missionCompletion = percentage(
    evidence.mission.completed,
    evidence.mission.assigned,
  );
  const individualContribution = teamScore({
    finalMastery,
    improvement,
    missionCompletion,
    reflection: 100,
  });
  if (individualContribution === null) {
    throw new CompletionBoundaryError("INVALID_COMPLETION", 400);
  }

  return repository.saveCompletion({
    attemptId: input.attemptId,
    idempotencyKey: input.idempotencyKey,
    diagnostic: evidence.diagnostic,
    final: evidence.final,
    retry: evidence.retry,
    retryFormative: true,
    finalMastery,
    improvement,
    missionCompletion,
    reflectionCompletion: 100,
    individualContribution,
    formulaVersion: "team-score-60-25-10-5-v1",
    reflectionChoice: input.reflectionChoice,
    reflectionNote: validatedNote(input.reflectionNote),
    reflectionPromptConceptId:
      evidence.finalMisconceptionConceptIds[0] ?? "C1",
  });
}
