import {
  CompletionBoundaryError,
  completeQuest,
  type CompletionRepository,
  type QuestCompletionRecord,
} from "../functions/_shared/completion-core";

const attemptId = "a1000000-0000-4000-8000-000000000001";
const studentId = "a2000000-0000-4000-8000-000000000001";

function repository(): CompletionRepository & {
  saved: QuestCompletionRecord | null;
} {
  return {
    saved: null,
    async findCompletedAttempt() {
      return this.saved;
    },
    async loadEvidence() {
      return {
        ownerStudentId: studentId,
        currentPhase: "reflection",
        diagnostic: { correct: 3, total: 8 },
        mission: { completed: 6, assigned: 6 },
        final: { correct: 6, total: 8 },
        retry: { correct: 2, total: 2 },
        retryConceptIds: ["C2", "C7"],
        finalMisconceptionConceptIds: ["C2", "C7"],
      };
    },
    async saveCompletion(record) {
      this.saved = record;
      return record;
    },
  };
}

it("keeps final and formative retry evidence separate", async () => {
  const result = await completeQuest(
    studentId,
    {
      attemptId,
      idempotencyKey: "a3000000-0000-4000-8000-000000000001",
      reflectionChoice: "apply",
      reflectionNote: "I will use a worked example before group practice.",
    },
    repository(),
  );

  expect(result.final).toEqual({ correct: 6, total: 8 });
  expect(result.retry).toEqual({ correct: 2, total: 2 });
  expect(result.finalMastery).toBe(75);
  expect(result.retryFormative).toBe(true);
});

it("requires retry assignments to target final misconceptions", async () => {
  const store = repository();
  store.loadEvidence = async () => ({
    ownerStudentId: studentId,
    currentPhase: "reflection",
    diagnostic: { correct: 3, total: 8 },
    mission: { completed: 6, assigned: 6 },
    final: { correct: 6, total: 8 },
    retry: { correct: 1, total: 1 },
    retryConceptIds: ["C4"],
    finalMisconceptionConceptIds: ["C2", "C7"],
  });

  await expect(
    completeQuest(
      studentId,
      {
        attemptId,
        idempotencyKey: "a3000000-0000-4000-8000-000000000002",
        reflectionChoice: "discuss",
      },
      store,
    ),
  ).rejects.toMatchObject({
    code: "RETRY_TARGET_INVALID",
  });
});

it("rejects completion until every scored final item is accepted", async () => {
  const store = repository();
  store.loadEvidence = async () => ({
    ownerStudentId: studentId,
    currentPhase: "reflection",
    diagnostic: { correct: 3, total: 8 },
    mission: { completed: 6, assigned: 6 },
    final: { correct: 5, total: 7 },
    retry: { correct: 0, total: 0 },
    retryConceptIds: [],
    finalMisconceptionConceptIds: ["C2", "C7"],
  });

  await expect(
    completeQuest(
      studentId,
      {
        attemptId,
        idempotencyKey: "a3000000-0000-4000-8000-000000000003",
        reflectionChoice: "revisit",
      },
      store,
    ),
  ).rejects.toBeInstanceOf(CompletionBoundaryError);
});

it("validates the optional private reflection note without scoring quality", async () => {
  const store = repository();
  const result = await completeQuest(
    studentId,
    {
      attemptId,
      idempotencyKey: "a3000000-0000-4000-8000-000000000004",
      reflectionChoice: "apply",
    },
    store,
  );

  expect(result.reflectionCompletion).toBe(100);
  expect(result.individualContribution).toBe(75);
  expect(store.saved?.reflectionNote).toBeNull();
});
