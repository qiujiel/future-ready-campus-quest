import type {
  ConceptId,
  LearningInteractionPayload,
  LearningItemPayload,
  LearningPhase,
  ResponseResult,
  ResponseSubmission,
  SupportState,
} from "../../../src/shared/api/contracts.ts";

export interface ProtectedAssignment {
  assignmentId: string;
  attemptId: string;
  ownerStudentId: string;
  itemId: string;
  conceptId: ConceptId;
  phase: LearningPhase;
  stem: string;
  interaction: LearningInteractionPayload;
  correctResponse: string[] | Record<string, string>;
  explanation: string;
  misconceptionTag: string;
  supportState: SupportState;
  conceptReminder?: string;
  sourcePageLabel?: string;
  lastAcceptedSequence: number;
  acceptedResponse: StoredResponseResult | null;
}

export type StoredResponseResult = ResponseResult;

export interface AcceptedResponseInput {
  assignment: ProtectedAssignment;
  idempotencyKey: string;
  selectedOptionIds: string[];
  clientSequence: number;
  confidence?: ResponseSubmission["confidence"];
  correct: boolean;
  explanation: string;
  misconceptionTag: string | null;
}

export interface AtomicResponseRepository {
  findByIdempotencyKey(
    attemptId: string,
    idempotencyKey: string,
  ): Promise<StoredResponseResult | null>;
  loadAssignmentForUpdate(
    attemptId: string,
    assignmentId: string,
  ): Promise<ProtectedAssignment | null>;
  commitAcceptedResponse(
    input: AcceptedResponseInput,
  ): Promise<StoredResponseResult>;
}

export class LearningBoundaryError extends Error {
  constructor(
    public readonly code:
      | "INVALID_RESPONSE"
      | "ASSIGNMENT_NOT_AVAILABLE"
      | "STALE_SEQUENCE"
      | "RESPONSE_ALREADY_ACCEPTED",
    public readonly status: number,
  ) {
    super(code);
  }
}

export function toLearningItemPayload(
  assignment: ProtectedAssignment,
): LearningItemPayload {
  return {
    assignmentId: assignment.assignmentId,
    itemId: assignment.itemId,
    conceptId: assignment.conceptId,
    phase: assignment.phase,
    formative: assignment.phase === "retry",
    stem: assignment.stem,
    interaction: assignment.interaction,
    support: {
      ...(assignment.conceptReminder
        ? { conceptReminder: assignment.conceptReminder }
        : {}),
      ...(assignment.sourcePageLabel
        ? { sourcePageLabel: assignment.sourcePageLabel }
        : {}),
    },
  };
}

function sameMembers(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
}

function selectedClassification(
  selectedOptionIds: string[],
): Record<string, string> {
  return Object.fromEntries(
    selectedOptionIds.map((selection) => {
      const separator = selection.indexOf("=");
      if (separator < 1 || separator === selection.length - 1) {
        throw new LearningBoundaryError("INVALID_RESPONSE", 400);
      }
      return [
        selection.slice(0, separator),
        selection.slice(separator + 1),
      ];
    }),
  );
}

function responseIsCorrect(
  assignment: ProtectedAssignment,
  selectedOptionIds: string[],
): boolean {
  if (Array.isArray(assignment.correctResponse)) {
    return assignment.interaction.kind === "scenario-sort"
      ? assignment.correctResponse.length === selectedOptionIds.length &&
          assignment.correctResponse.every(
            (value, index) => value === selectedOptionIds[index],
          )
      : sameMembers(assignment.correctResponse, selectedOptionIds);
  }
  return (
    JSON.stringify(selectedClassification(selectedOptionIds)) ===
    JSON.stringify(assignment.correctResponse)
  );
}

function validateSubmission(input: ResponseSubmission): void {
  if (
    !input.attemptId ||
    !input.assignmentId ||
    !input.idempotencyKey ||
    !Number.isInteger(input.clientSequence) ||
    input.clientSequence < 1 ||
    input.selectedOptionIds.length < 1 ||
    input.selectedOptionIds.some((optionId) => !optionId.trim())
  ) {
    throw new LearningBoundaryError("INVALID_RESPONSE", 400);
  }
}

export async function processResponseSubmission(
  actorStudentId: string,
  input: ResponseSubmission,
  repository: AtomicResponseRepository,
): Promise<ResponseResult> {
  validateSubmission(input);
  const assignment = await repository.loadAssignmentForUpdate(
    input.attemptId,
    input.assignmentId,
  );
  if (!assignment || assignment.ownerStudentId !== actorStudentId) {
    throw new LearningBoundaryError("ASSIGNMENT_NOT_AVAILABLE", 404);
  }

  const replay = await repository.findByIdempotencyKey(
    input.attemptId,
    input.idempotencyKey,
  );
  if (replay) return replay;

  if (input.clientSequence !== assignment.lastAcceptedSequence + 1) {
    throw new LearningBoundaryError("STALE_SEQUENCE", 409);
  }
  if (assignment.acceptedResponse) {
    throw new LearningBoundaryError("RESPONSE_ALREADY_ACCEPTED", 409);
  }

  const correct = responseIsCorrect(
    assignment,
    input.selectedOptionIds,
  );
  return repository.commitAcceptedResponse({
    assignment,
    idempotencyKey: input.idempotencyKey,
    selectedOptionIds: input.selectedOptionIds,
    clientSequence: input.clientSequence,
    ...(input.confidence ? { confidence: input.confidence } : {}),
    correct,
    explanation: assignment.explanation,
    misconceptionTag: correct ? null : assignment.misconceptionTag,
  });
}
