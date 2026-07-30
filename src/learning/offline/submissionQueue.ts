import type {
  AttemptState,
  ResponseResult,
  ResponseSubmission,
} from "../../shared/api/contracts";

export type PendingResponseDraft = Omit<
  ResponseSubmission,
  "idempotencyKey"
>;

export interface PendingResponseRecord extends ResponseSubmission {
  enqueuedAt: number;
  retryCount: number;
  nextAttemptAt: number;
}

export interface PendingSubmissionStore {
  findByAssignment(
    attemptId: string,
    assignmentId: string,
  ): Promise<PendingResponseRecord | null>;
  list(attemptId: string): Promise<PendingResponseRecord[]>;
  put(record: PendingResponseRecord): Promise<void>;
  delete(idempotencyKey: string): Promise<void>;
  clearAttempt(attemptId: string): Promise<void>;
}

export interface SubmissionTransport {
  submitResponse(input: ResponseSubmission): Promise<ResponseResult>;
  getAttemptState(attemptId: string): Promise<AttemptState>;
}

export type FlushResult =
  | {
      status: "idle" | "drained";
      acknowledged: number;
    }
  | {
      status: "retry-scheduled" | "auth-required";
      acknowledged: number;
    }
  | {
      status: "reconciled";
      acknowledged: number;
      state: AttemptState;
    };

export interface SubmissionQueueOptions {
  store: PendingSubmissionStore;
  transport: SubmissionTransport;
  now?: () => number;
  random?: () => number;
  makeIdempotencyKey?: (input: PendingResponseDraft) => string;
}

function sorted(records: PendingResponseRecord[]): PendingResponseRecord[] {
  return [...records].sort(
    (left, right) =>
      left.clientSequence - right.clientSequence ||
      left.enqueuedAt - right.enqueuedAt,
  );
}

function boundaryCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
}

export class SubmissionQueue {
  private readonly store: PendingSubmissionStore;
  private readonly transport: SubmissionTransport;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly makeIdempotencyKey: (
    input: PendingResponseDraft,
  ) => string;
  private activeFlush: Promise<FlushResult> | undefined;

  constructor(options: SubmissionQueueOptions) {
    this.store = options.store;
    this.transport = options.transport;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.makeIdempotencyKey =
      options.makeIdempotencyKey ?? (() => crypto.randomUUID());
  }

  async enqueue(
    input: PendingResponseDraft,
  ): Promise<PendingResponseRecord> {
    const existing = await this.store.findByAssignment(
      input.attemptId,
      input.assignmentId,
    );
    if (existing) return existing;

    const record: PendingResponseRecord = {
      attemptId: input.attemptId,
      assignmentId: input.assignmentId,
      idempotencyKey: this.makeIdempotencyKey(input),
      selectedOptionIds: [...input.selectedOptionIds],
      clientSequence: input.clientSequence,
      ...(input.confidence ? { confidence: input.confidence } : {}),
      enqueuedAt: this.now(),
      retryCount: 0,
      nextAttemptAt: 0,
    };
    await this.store.put(record);
    return record;
  }

  flush(attemptId: string): Promise<FlushResult> {
    if (this.activeFlush) return this.activeFlush;
    this.activeFlush = this.drain(attemptId).finally(() => {
      this.activeFlush = undefined;
    });
    return this.activeFlush;
  }

  private async reconcile(
    attemptId: string,
    state: AttemptState,
  ): Promise<void> {
    const pending = sorted(await this.store.list(attemptId));
    let nextSequence = state.lastAcceptedSequence + 1;
    for (const record of pending) {
      if (record.clientSequence <= state.lastAcceptedSequence) {
        await this.store.delete(record.idempotencyKey);
        continue;
      }
      if (record.clientSequence !== nextSequence) {
        await this.store.put({
          ...record,
          clientSequence: nextSequence,
          nextAttemptAt: 0,
        });
      }
      nextSequence += 1;
    }
  }

  private async drain(attemptId: string): Promise<FlushResult> {
    let acknowledged = 0;
    const pending = sorted(await this.store.list(attemptId));
    if (pending.length === 0) return { status: "idle", acknowledged };

    for (const record of pending) {
      if (record.nextAttemptAt > this.now()) {
        return { status: "retry-scheduled", acknowledged };
      }
      try {
        await this.transport.submitResponse(record);
        await this.store.delete(record.idempotencyKey);
        acknowledged += 1;
      } catch (error) {
        if (boundaryCode(error) === "AUTH_REQUIRED") {
          return { status: "auth-required", acknowledged };
        }
        if (boundaryCode(error) === "STALE_SEQUENCE") {
          const state = await this.transport.getAttemptState(attemptId);
          await this.reconcile(attemptId, state);
          return { status: "reconciled", acknowledged, state };
        }

        const retryCount = record.retryCount + 1;
        const baseDelay = Math.min(
          30_000,
          1_000 * 2 ** (retryCount - 1),
        );
        const jitter = Math.round(baseDelay * 0.5 * this.random());
        await this.store.put({
          ...record,
          retryCount,
          nextAttemptAt: this.now() + baseDelay + jitter,
        });
        return { status: "retry-scheduled", acknowledged };
      }
    }

    return { status: "drained", acknowledged };
  }
}

export class InMemoryPendingSubmissionStore
  implements PendingSubmissionStore
{
  private readonly records = new Map<string, PendingResponseRecord>();

  async findByAssignment(
    attemptId: string,
    assignmentId: string,
  ): Promise<PendingResponseRecord | null> {
    return (
      [...this.records.values()].find(
        (record) =>
          record.attemptId === attemptId &&
          record.assignmentId === assignmentId,
      ) ?? null
    );
  }

  async list(attemptId: string): Promise<PendingResponseRecord[]> {
    return sorted(
      [...this.records.values()].filter(
        (record) => record.attemptId === attemptId,
      ),
    ).map((record) => structuredClone(record));
  }

  async put(record: PendingResponseRecord): Promise<void> {
    this.records.set(record.idempotencyKey, structuredClone(record));
  }

  async delete(idempotencyKey: string): Promise<void> {
    this.records.delete(idempotencyKey);
  }

  async clearAttempt(attemptId: string): Promise<void> {
    for (const record of this.records.values()) {
      if (record.attemptId === attemptId) {
        this.records.delete(record.idempotencyKey);
      }
    }
  }

  async dump(): Promise<PendingResponseRecord[]> {
    return [...this.records.values()].map((record) =>
      structuredClone(record)
    );
  }
}

const databaseName = "campus-quest-pending-responses-v1";
const storeName = "pending-responses";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

export class IndexedDbPendingSubmissionStore
  implements PendingSubmissionStore
{
  private readonly database: Promise<IDBDatabase>;

  constructor(indexedDb: IDBFactory = indexedDB) {
    this.database = new Promise((resolve, reject) => {
      const request = indexedDb.open(databaseName, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(storeName, {
          keyPath: "idempotencyKey",
        });
        store.createIndex(
          "attempt-assignment",
          ["attemptId", "assignmentId"],
          { unique: true },
        );
        store.createIndex("attempt", "attemptId");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error ?? new Error("IndexedDB could not open."));
    });
  }

  async findByAssignment(
    attemptId: string,
    assignmentId: string,
  ): Promise<PendingResponseRecord | null> {
    const database = await this.database;
    const transaction = database.transaction(storeName, "readonly");
    const completed = transactionDone(transaction);
    const request = transaction
      .objectStore(storeName)
      .index("attempt-assignment")
      .get([attemptId, assignmentId]);
    const result = await requestResult(request);
    await completed;
    return (result as PendingResponseRecord | undefined) ?? null;
  }

  async list(attemptId: string): Promise<PendingResponseRecord[]> {
    const database = await this.database;
    const transaction = database.transaction(storeName, "readonly");
    const completed = transactionDone(transaction);
    const request = transaction
      .objectStore(storeName)
      .index("attempt")
      .getAll(IDBKeyRange.only(attemptId));
    const result = await requestResult(request);
    await completed;
    return sorted(result as PendingResponseRecord[]);
  }

  async put(record: PendingResponseRecord): Promise<void> {
    const database = await this.database;
    const transaction = database.transaction(storeName, "readwrite");
    const completed = transactionDone(transaction);
    transaction.objectStore(storeName).put(record);
    await completed;
  }

  async delete(idempotencyKey: string): Promise<void> {
    const database = await this.database;
    const transaction = database.transaction(storeName, "readwrite");
    const completed = transactionDone(transaction);
    transaction.objectStore(storeName).delete(idempotencyKey);
    await completed;
  }

  async clearAttempt(attemptId: string): Promise<void> {
    const records = await this.list(attemptId);
    const database = await this.database;
    const transaction = database.transaction(storeName, "readwrite");
    const completed = transactionDone(transaction);
    const store = transaction.objectStore(storeName);
    for (const record of records) store.delete(record.idempotencyKey);
    await completed;
  }
}
