import {
  InMemoryPendingSubmissionStore,
  SubmissionQueue,
  type SubmissionTransport,
} from "../../src/learning/offline/submissionQueue";
import { LearningGatewayError } from "../../src/learning/api/learningClient";
import type {
  AttemptState,
  ResponseResult,
} from "../../src/shared/api/contracts";

const attemptId = "b1000000-0000-4000-8000-000000000001";

function result(responseId: string): ResponseResult {
  return {
    responseId,
    correct: true,
    formative: false,
    explanation: "Visible only in the current authenticated response.",
    misconceptionTag: null,
    conceptState: "secure",
    nextPhase: "diagnostic",
  };
}

function state(lastAcceptedSequence: number): AttemptState {
  return {
    attemptId,
    status: "active",
    currentPhase: "diagnostic",
    lastAcceptedSequence,
  };
}

function draft(sequence: number) {
  return {
    attemptId,
    assignmentId: `b2000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    selectedOptionIds: ["A"],
    clientSequence: sequence,
    confidence: "very_sure" as const,
  };
}

it("allows only one in-flight mutation and replays in sequence order", async () => {
  let releaseFirst!: () => void;
  const firstPending = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const calls: number[] = [];
  const transport: SubmissionTransport = {
    async submitResponse(input) {
      calls.push(input.clientSequence);
      if (input.clientSequence === 1) await firstPending;
      return result(`response-${input.clientSequence}`);
    },
    async getAttemptState() {
      return state(0);
    },
  };
  const queue = new SubmissionQueue({
    store: new InMemoryPendingSubmissionStore(),
    transport,
    makeIdempotencyKey: (input) => `key-${input.clientSequence}`,
  });
  await queue.enqueue(draft(2));
  await queue.enqueue(draft(1));

  const firstFlush = queue.flush(attemptId);
  const duplicateFlush = queue.flush(attemptId);
  await Promise.resolve();

  expect(calls).toEqual([1]);
  releaseFirst();
  await expect(firstFlush).resolves.toMatchObject({
    status: "drained",
    acknowledged: 2,
  });
  await expect(duplicateFlush).resolves.toEqual(await firstFlush);
  expect(calls).toEqual([1, 2]);
});

it("preserves an assignment's idempotency key across queue recreation", async () => {
  const store = new InMemoryPendingSubmissionStore();
  const transport: SubmissionTransport = {
    async submitResponse() {
      return result("unused");
    },
    async getAttemptState() {
      return state(0);
    },
  };
  const firstQueue = new SubmissionQueue({
    store,
    transport,
    makeIdempotencyKey: () => "stable-key",
  });
  const first = await firstQueue.enqueue(draft(1));
  const resumedQueue = new SubmissionQueue({
    store,
    transport,
    makeIdempotencyKey: () => "different-key",
  });
  const resumed = await resumedQueue.enqueue(draft(1));

  expect(resumed.idempotencyKey).toBe(first.idempotencyKey);
  expect(await store.list(attemptId)).toHaveLength(1);
});

it("removes acknowledgements without persisting returned explanations", async () => {
  const store = new InMemoryPendingSubmissionStore();
  const queue = new SubmissionQueue({
    store,
    transport: {
      async submitResponse() {
        return result("response-1");
      },
      async getAttemptState() {
        return state(0);
      },
    },
    makeIdempotencyKey: () => "ack-key",
  });
  await queue.enqueue(draft(1));

  await queue.flush(attemptId);

  expect(await store.list(attemptId)).toEqual([]);
  expect(JSON.stringify(await store.dump())).not.toContain("explanation");
});

it("reconciles stale sequences from authoritative server state", async () => {
  const store = new InMemoryPendingSubmissionStore();
  let attempts = 0;
  const queue = new SubmissionQueue({
    store,
    transport: {
      async submitResponse(input) {
        attempts += 1;
        if (attempts === 1) {
          throw new LearningGatewayError("STALE_SEQUENCE");
        }
        return result(`response-${input.clientSequence}`);
      },
      async getAttemptState() {
        return state(1);
      },
    },
    makeIdempotencyKey: (input) => `stale-${input.clientSequence}`,
  });
  await queue.enqueue(draft(1));
  await queue.enqueue(draft(2));

  await expect(queue.flush(attemptId)).resolves.toMatchObject({
    status: "reconciled",
    state: { lastAcceptedSequence: 1 },
  });
  expect((await store.list(attemptId)).map((item) => item.clientSequence))
    .toEqual([2]);

  await expect(queue.flush(attemptId)).resolves.toMatchObject({
    status: "drained",
    acknowledged: 1,
  });
});

it("stops on authorization loss so recovery can be requested", async () => {
  const store = new InMemoryPendingSubmissionStore();
  const queue = new SubmissionQueue({
    store,
    transport: {
      async submitResponse() {
        throw new LearningGatewayError("AUTH_REQUIRED");
      },
      async getAttemptState() {
        return state(0);
      },
    },
    makeIdempotencyKey: () => "auth-key",
  });
  await queue.enqueue(draft(1));

  await expect(queue.flush(attemptId)).resolves.toMatchObject({
    status: "auth-required",
    acknowledged: 0,
  });
  expect(await store.list(attemptId)).toHaveLength(1);
});

it("records exponential retry with jitter after a network failure", async () => {
  const store = new InMemoryPendingSubmissionStore();
  const queue = new SubmissionQueue({
    store,
    transport: {
      async submitResponse() {
        throw new Error("network offline");
      },
      async getAttemptState() {
        return state(0);
      },
    },
    now: () => 1_000,
    random: () => 0.5,
    makeIdempotencyKey: () => "retry-key",
  });
  await queue.enqueue(draft(1));

  await expect(queue.flush(attemptId)).resolves.toMatchObject({
    status: "retry-scheduled",
  });
  expect(await store.list(attemptId)).toMatchObject([
    {
      retryCount: 1,
      nextAttemptAt: 2_250,
    },
  ]);
});
