import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { transformWithOxc } from "vite";

const queueSourceUrl = new URL(
  "../../src/learning/offline/submissionQueue.ts",
  import.meta.url,
);

async function installQueueHarness(
  page: Page,
): Promise<void> {
  const browserErrors: string[] = [];
  const recordPageError = (error: Error) => {
    browserErrors.push(error.message);
  };
  page.on("pageerror", recordPageError);
  const source = await readFile(queueSourceUrl, "utf8");
  const transformed = await transformWithOxc(
    source,
    queueSourceUrl.pathname,
    { lang: "ts" },
  );
  const harness = `
const attemptId = "c1000000-0000-4000-8000-000000000001";
const stateKey = "adaptive-journey-server";
const queueDatabaseName = "campus-quest-pending-responses-v1";

function readServer() {
  return JSON.parse(localStorage.getItem(stateKey) ?? JSON.stringify({
    lastAcceptedSequence: 0,
    interrupted: false,
    acceptedByKey: {},
    acceptedAssignments: [],
  }));
}

function writeServer(server) {
  localStorage.setItem(stateKey, JSON.stringify(server));
}

function transport() {
  return {
    async submitResponse(input) {
      const server = readServer();
      if (
        input.assignmentId === "final-C4" &&
        !server.interrupted
      ) {
        server.interrupted = true;
        writeServer(server);
        throw new Error("simulated network interruption");
      }
      if (server.acceptedByKey[input.idempotencyKey]) {
        return server.acceptedByKey[input.idempotencyKey];
      }
      if (input.clientSequence !== server.lastAcceptedSequence + 1) {
        const error = new Error("stale sequence");
        error.code = "STALE_SEQUENCE";
        throw error;
      }
      if (server.acceptedAssignments.includes(input.assignmentId)) {
        throw new Error("duplicate assignment");
      }
      const response = {
        responseId: "response-" + input.clientSequence,
        correct: true,
        formative: false,
        explanation: "memory only",
        misconceptionTag: null,
        conceptState: "secure",
        nextPhase: input.assignmentId.startsWith("final-")
          ? "final"
          : "diagnostic",
      };
      server.lastAcceptedSequence = input.clientSequence;
      server.acceptedByKey[input.idempotencyKey] = response;
      server.acceptedAssignments.push(input.assignmentId);
      writeServer(server);
      return response;
    },
    async getAttemptState() {
      const server = readServer();
      return {
        attemptId,
        status: "active",
        currentPhase: "final",
        lastAcceptedSequence: server.lastAcceptedSequence,
      };
    },
  };
}

function draft(phase, conceptNumber, sequence) {
  return {
    attemptId,
    assignmentId: phase + "-C" + conceptNumber,
    selectedOptionIds: ["A"],
    clientSequence: sequence,
    confidence: "very_sure",
  };
}

globalThis.__questHarness = {
  async reset() {
    localStorage.removeItem(stateKey);
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(queueDatabaseName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("database deletion blocked"));
    });
  },
  async firstLeg() {
    let keyCounter = 0;
    const store = new IndexedDbPendingSubmissionStore();
    const queue = new SubmissionQueue({
      store,
      transport: transport(),
      now: () => 1_000,
      random: () => 0.5,
      makeIdempotencyKey: () => "journey-key-" + (++keyCounter),
    });
    for (let concept = 1; concept <= 8; concept += 1) {
      await queue.enqueue(draft("diagnostic", concept, concept));
    }
    for (let concept = 1; concept <= 8; concept += 1) {
      await queue.enqueue(draft("final", concept, concept + 8));
    }
    const outcome = await queue.flush(attemptId);
    const pending = await store.list(attemptId);
    const interrupted = pending.find(
      (record) => record.assignmentId === "final-C4"
    );
    return {
      outcome,
      interruptedKey: interrupted?.idempotencyKey,
      pendingCount: pending.length,
      acceptedCount: readServer().acceptedAssignments.length,
    };
  },
  async secondLeg(expectedKey) {
    const store = new IndexedDbPendingSubmissionStore();
    const before = await store.findByAssignment(attemptId, "final-C4");
    const queue = new SubmissionQueue({
      store,
      transport: transport(),
      now: () => 5_000,
      random: () => 0.5,
      makeIdempotencyKey: () => "must-not-replace-persisted-key",
    });
    const resumed = await queue.enqueue(draft("final", 4, 12));
    const outcome = await queue.flush(attemptId);
    const server = readServer();
    return {
      outcome,
      keyBeforeResume: before?.idempotencyKey,
      keyAfterResume: resumed.idempotencyKey,
      keyWasStable: resumed.idempotencyKey === expectedKey,
      pendingCount: (await store.list(attemptId)).length,
      acceptedCount: server.acceptedAssignments.length,
      acceptedUniqueCount: new Set(server.acceptedAssignments).size,
      diagnosticConcepts: server.acceptedAssignments
        .filter((id) => id.startsWith("diagnostic-"))
        .map((id) => id.slice("diagnostic-".length))
        .sort(),
      finalConcepts: server.acceptedAssignments
        .filter((id) => id.startsWith("final-"))
        .map((id) => id.slice("final-".length))
        .sort(),
    };
  },
};
`;

  await page.unroute("**/__quest-queue-harness.js");
  await page.route("**/__quest-queue-harness.js", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/javascript; charset=utf-8",
      body: `${transformed.code}\n${harness}`,
    });
  });
  await page.addScriptTag({
    type: "module",
    url: "/__quest-queue-harness.js",
  });
  try {
    await page.waitForFunction(
      () => "__questHarness" in globalThis,
      undefined,
      { timeout: 5_000 },
    );
  } catch {
    throw new Error(
      `Queue harness did not load: ${
        browserErrors.join(" | ") || "no page error was reported"
      }`,
    );
  } finally {
    page.off("pageerror", recordPageError);
  }
}

test("resumes an adaptive C1-C8 journey without duplicate final responses", async ({
  page,
}) => {
  await page.goto("/");
  await installQueueHarness(page);
  await page.evaluate("globalThis.__questHarness.reset()");

  const first = await page.evaluate(
    "globalThis.__questHarness.firstLeg()",
  ) as {
    outcome: { status: string; acknowledged: number };
    interruptedKey: string;
    pendingCount: number;
    acceptedCount: number;
  };
  expect(first.outcome).toEqual({
    status: "retry-scheduled",
    acknowledged: 11,
  });
  expect(first.pendingCount).toBe(5);
  expect(first.acceptedCount).toBe(11);

  await page.reload();
  await installQueueHarness(page);
  const second = await page.evaluate(
    `globalThis.__questHarness.secondLeg(${JSON.stringify(first.interruptedKey)})`,
  ) as {
    outcome: { status: string; acknowledged: number };
    keyBeforeResume: string;
    keyAfterResume: string;
    keyWasStable: boolean;
    pendingCount: number;
    acceptedCount: number;
    acceptedUniqueCount: number;
    diagnosticConcepts: string[];
    finalConcepts: string[];
  };

  expect(second.outcome).toEqual({ status: "drained", acknowledged: 5 });
  expect(second.keyBeforeResume).toBe(first.interruptedKey);
  expect(second.keyAfterResume).toBe(first.interruptedKey);
  expect(second.keyWasStable).toBe(true);
  expect(second.pendingCount).toBe(0);
  expect(second.acceptedCount).toBe(16);
  expect(second.acceptedUniqueCount).toBe(16);
  expect(second.diagnosticConcepts).toEqual([
    "C1",
    "C2",
    "C3",
    "C4",
    "C5",
    "C6",
    "C7",
    "C8",
  ]);
  expect(second.finalConcepts).toEqual([
    "C1",
    "C2",
    "C3",
    "C4",
    "C5",
    "C6",
    "C7",
    "C8",
  ]);
});
