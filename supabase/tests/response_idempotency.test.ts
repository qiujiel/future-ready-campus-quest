import {
  LearningBoundaryError,
  processResponseSubmission,
  toLearningItemPayload,
  type AtomicResponseRepository,
  type ProtectedAssignment,
  type StoredResponseResult,
} from "../functions/_shared/learning-core";
import type { ResponseSubmission } from "../../src/shared/api/contracts";

const assignment: ProtectedAssignment = {
  assignmentId: "81000000-0000-4000-8000-000000000001",
  attemptId: "82000000-0000-4000-8000-000000000001",
  ownerStudentId: "83000000-0000-4000-8000-000000000001",
  itemId: "C1-Q1",
  conceptId: "C1",
  phase: "final",
  stem: "Which synthetic option is marked correct for this boundary test?",
  interaction: {
    kind: "single-choice",
    options: [
      { id: "A", text: "Synthetic option A" },
      { id: "B", text: "Synthetic option B" },
      { id: "C", text: "Synthetic option C" },
    ],
  },
  correctResponse: ["A"],
  explanation:
    "Synthetic option A is correct only for this unrelated public fixture.",
  misconceptionTag: "C1-M1",
  supportState: "developing",
  sourcePageLabel: "Synthetic source, page 1",
  lastAcceptedSequence: 0,
  acceptedResponse: null,
};

const submission: ResponseSubmission = {
  attemptId: assignment.attemptId,
  assignmentId: assignment.assignmentId,
  idempotencyKey: "84000000-0000-4000-8000-000000000001",
  selectedOptionIds: ["A"],
  clientSequence: 1,
  confidence: "very_sure",
};

function repository(
  initial: ProtectedAssignment = assignment,
): AtomicResponseRepository & {
  state: ProtectedAssignment;
  byRequest: Map<string, StoredResponseResult>;
} {
  const byRequest = new Map<string, StoredResponseResult>();
  return {
    state: structuredClone(initial),
    byRequest,
    async findByIdempotencyKey(_attemptId, idempotencyKey) {
      return byRequest.get(idempotencyKey) ?? null;
    },
    async loadAssignmentForUpdate() {
      return structuredClone(this.state);
    },
    async commitAcceptedResponse(input) {
      if (this.state.acceptedResponse) {
        throw new LearningBoundaryError("RESPONSE_ALREADY_ACCEPTED", 409);
      }
      const result: StoredResponseResult = {
        responseId: "85000000-0000-4000-8000-000000000001",
        correct: input.correct,
        explanation: input.explanation,
        misconceptionTag: input.misconceptionTag,
        conceptState: "secure",
        nextPhase: "retry",
      };
      this.state.acceptedResponse = result;
      this.state.lastAcceptedSequence = input.clientSequence;
      byRequest.set(input.idempotencyKey, result);
      return result;
    },
  };
}

it("omits correctness, rationale, and misconception answers from current items", () => {
  const payload = toLearningItemPayload(assignment);

  expect(payload).toEqual({
    assignmentId: assignment.assignmentId,
    itemId: "C1-Q1",
    conceptId: "C1",
    phase: "final",
    stem: assignment.stem,
    interaction: {
      kind: "single-choice",
      options: assignment.interaction.options,
    },
    support: {
      sourcePageLabel: "Synthetic source, page 1",
    },
  });
  expect(payload).not.toHaveProperty("correctResponse");
  expect(payload).not.toHaveProperty("explanation");
  expect(payload).not.toHaveProperty("misconceptionTag");
});

it("returns correctness and explanation only after accepting a response", async () => {
  const result = await processResponseSubmission(
    assignment.ownerStudentId,
    submission,
    repository(),
  );

  expect(result).toMatchObject({
    correct: true,
    explanation: assignment.explanation,
    misconceptionTag: null,
  });
});

it("replays the original result for the same idempotency key", async () => {
  const store = repository();
  const first = await processResponseSubmission(
    assignment.ownerStudentId,
    submission,
    store,
  );
  const replay = await processResponseSubmission(
    assignment.ownerStudentId,
    { ...submission, selectedOptionIds: ["B"] },
    store,
  );

  expect(replay).toEqual(first);
  expect(store.state.lastAcceptedSequence).toBe(1);
});

it("rejects a stale client sequence", async () => {
  const store = repository({
    ...assignment,
    lastAcceptedSequence: 3,
  });

  await expect(
    processResponseSubmission(
      assignment.ownerStudentId,
      { ...submission, clientSequence: 3 },
      store,
    ),
  ).rejects.toMatchObject({
    code: "STALE_SEQUENCE",
    status: 409,
  });
});

it("rejects another student's assignment", async () => {
  await expect(
    processResponseSubmission(
      "83000000-0000-4000-8000-000000000002",
      submission,
      repository(),
    ),
  ).rejects.toMatchObject({
    code: "ASSIGNMENT_NOT_AVAILABLE",
    status: 404,
  });
});

it("does not allow an accepted final response to be changed", async () => {
  const store = repository();
  await processResponseSubmission(
    assignment.ownerStudentId,
    submission,
    store,
  );

  await expect(
    processResponseSubmission(
      assignment.ownerStudentId,
      {
        ...submission,
        idempotencyKey: "84000000-0000-4000-8000-000000000002",
        selectedOptionIds: ["B"],
        clientSequence: 2,
      },
      store,
    ),
  ).rejects.toMatchObject({
    code: "RESPONSE_ALREADY_ACCEPTED",
    status: 409,
  });
});
