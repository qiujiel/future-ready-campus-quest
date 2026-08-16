import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  IndexedDbPendingSubmissionStore,
  SubmissionQueue,
  type PendingResponseDraft,
} from "../../learning/offline/submissionQueue";
import { formatConceptLabel } from "../../learning/domain/concepts";
import type {
  LearningItemPayload,
  ReflectionPrompt,
  ResponseResult,
} from "../../shared/api/contracts";
import { Button } from "../../ui/Button";
import type { CampusPhase } from "../../ui/ProgressTrail";
import {
  GroupStudio,
} from "../group/GroupStudio";
import {
  type GroupStudioGateway,
  supabaseGroupStudioGateway,
} from "../group/groupStudioGateway";
import { PersonalDebrief } from "../results/PersonalDebrief";
import { ReflectionCard } from "../results/ReflectionCard";
import { TeamLeaderboard } from "../results/TeamLeaderboard";
import { MissionCard } from "./MissionCard";
import { QuestShell } from "./QuestShell";
import {
  supabaseStudentQuestGateway,
  type StudentQuestAttempt,
  type StudentQuestContext,
  type StudentQuestGateway,
  type StudentQuestResults,
} from "./studentQuestGateway";

interface SubmissionQueueLike {
  enqueue(input: PendingResponseDraft): Promise<unknown>;
  flush(attemptId: string): Promise<unknown>;
}

function campusPhase(phase: StudentQuestAttempt["currentPhase"]): CampusPhase {
  if (phase === "retry") return "reflection";
  return phase;
}

function completedPhases(
  phase: StudentQuestAttempt["currentPhase"],
): CampusPhase[] {
  const sequence: CampusPhase[] = [
    "briefing",
    "diagnostic",
    "mission",
    "final",
    "reflection",
  ];
  return sequence.slice(0, sequence.indexOf(campusPhase(phase)));
}

function createQueue(
  gateway: StudentQuestGateway,
): SubmissionQueueLike | null {
  if (typeof indexedDB === "undefined") return null;
  return new SubmissionQueue({
    store: new IndexedDbPendingSubmissionStore(),
    transport: gateway,
  });
}

export function QuestEntryPage({
  gateway = supabaseStudentQuestGateway,
  groupGateway = supabaseGroupStudioGateway,
  queue: suppliedQueue,
  pollIntervalMs = 5_000,
}: {
  gateway?: StudentQuestGateway;
  groupGateway?: GroupStudioGateway;
  queue?: SubmissionQueueLike;
  pollIntervalMs?: number;
}) {
  const [context, setContext] = useState<StudentQuestContext | null>(null);
  const [attempt, setAttempt] = useState<StudentQuestAttempt | null>(null);
  const [item, setItem] = useState<LearningItemPayload | null>(null);
  const [prompt, setPrompt] = useState<ReflectionPrompt | null>(null);
  const [results, setResults] = useState<StudentQuestResults | null>(null);
  const [response, setResponse] = useState<ResponseResult | null>(null);
  const [acknowledgement, setAcknowledgement] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestKeys = useRef(new Map<string, string>());
  const loadAttemptInFlight = useRef<Promise<void> | null>(null);
  const attemptId = attempt?.attemptId;
  const queue = useMemo(
    () => suppliedQueue ?? createQueue(gateway),
    [gateway, suppliedQueue],
  );

  const loadAttempt = useCallback(() => {
    if (loadAttemptInFlight.current) return loadAttemptInFlight.current;
    const request = (async () => {
      const latest = await gateway.findLatestAttempt();
      if (!latest) {
        setAttempt(null);
        setResponse(null);
        setPrompt(null);
        setItem(null);
        setResults(null);
        return;
      }
      if (latest.status === "completed") {
        const nextResults = await gateway.loadResults(
          latest.attemptId,
          latest.cohortId,
        );
        setAttempt(latest);
        setResponse(null);
        setPrompt(null);
        setItem(null);
        setResults(nextResults);
        return;
      }
      if (latest.currentPhase === "reflection") {
        const nextPrompt = await gateway.getReflectionPrompt(latest.attemptId);
        setAttempt(latest);
        setResponse(null);
        setPrompt(nextPrompt);
        setItem(null);
        setResults(null);
        return;
      }
      const nextItem = await gateway.getNextItem(latest.attemptId);
      setAttempt(latest);
      setResponse(null);
      setPrompt(null);
      setItem(nextItem);
      setResults(null);
    })();
    const tracked = request.finally(() => {
      if (loadAttemptInFlight.current === tracked) {
        loadAttemptInFlight.current = null;
      }
    });
    loadAttemptInFlight.current = tracked;
    return tracked;
  }, [gateway]);

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const nextContext = await gateway.loadContext();
        if (!active) return;
        setContext(nextContext);
        await loadAttempt();
      } catch (caught) {
        if (!active) return;
        setError(
          caught instanceof Error &&
              caught.message === "STUDENT_SESSION_NOT_AVAILABLE"
            ? "This student session has expired. Ask your teacher for a recovery link, or return to student entry to start a new session."
            : "Your campus session could not be restored. Ask your teacher for help and try again.",
        );
      } finally {
        if (active) setLoading(false);
      }
    }
    void initialize();
    return () => {
      active = false;
    };
  }, [gateway, loadAttempt]);

  useEffect(() => {
    if (!pollIntervalMs || attempt) return;
    const timer = window.setInterval(() => {
      void loadAttempt().catch(() => undefined);
    }, pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [attempt, loadAttempt, pollIntervalMs]);

  useEffect(() => {
    if (!attemptId || !queue) return;
    const reconcile = () => {
      void queue.flush(attemptId).then(() => loadAttempt());
    };
    void queue.flush(attemptId).then(() => loadAttempt());
    window.addEventListener("online", reconcile);
    return () => window.removeEventListener("online", reconcile);
  }, [attemptId, loadAttempt, queue]);

  async function submitResponse(
    selectedOptionIds: string[],
  ): Promise<ResponseResult> {
    if (!attempt || !item) throw new Error("ATTEMPT_NOT_AVAILABLE");
    const idempotencyKey =
      requestKeys.current.get(item.assignmentId) ?? crypto.randomUUID();
    requestKeys.current.set(item.assignmentId, idempotencyKey);
    const submission = {
      attemptId: attempt.attemptId,
      assignmentId: item.assignmentId,
      selectedOptionIds,
      clientSequence: attempt.lastAcceptedSequence + 1,
      idempotencyKey,
    };
    try {
      const accepted = await gateway.submitResponse(submission);
      setResponse(accepted);
      setAcknowledgement(`${formatConceptLabel(item.conceptId)} response saved.`);
      return accepted;
    } catch (caught) {
      if (queue) {
        await queue.enqueue(submission);
      }
      throw caught;
    }
  }

  async function continueRoute() {
    setLoading(true);
    try {
      await loadAttempt();
    } catch {
      setError("Your next campus activity is not available yet.");
    } finally {
      setLoading(false);
    }
  }

  if (loading && !context) {
    return (
      <main className="route-shell">
        <p className="eyebrow">Restoring session</p>
        <h1>Finding your campus place…</h1>
      </main>
    );
  }

  if (error || !context) {
    return (
      <main className="route-shell">
        <p className="eyebrow">Session help</p>
        <h1>Your campus place needs attention</h1>
        <p>{error || "Ask your teacher for a recovery link."}</p>
        <a className="primary-action" href="#/">
          Return to student entry
        </a>
      </main>
    );
  }

  if (results) {
    return (
      <main className="preview-results quest-content">
        <header className="preview-results__header">
          <p className="eyebrow">Reflection Garden</p>
          <h1>Your quest debrief</h1>
          <p>Your detailed growth stays private; the board uses team results only.</p>
        </header>
        <PersonalDebrief
          explorerNickname={context.identity.nickname}
          concepts={results.concepts}
        />
        <TeamLeaderboard teams={results.teams} />
      </main>
    );
  }

  if (!attempt) {
    return (
      <>
        <GroupStudio
          currentStudentId={context.identity.studentId}
          group={context.group}
          isEditor={context.identity.isGroupIdentityEditor}
          members={context.members}
          gateway={groupGateway}
        />
        <section className="preview-callout quest-content">
          <p className="eyebrow">Briefing Plaza</p>
          <h2>Waiting for your teacher to open the quest</h2>
          <p>
            Keep this page open. It checks the secure campus record and resumes
            automatically when your attempt is ready.
          </p>
          <Button onClick={() => void continueRoute()}>Check quest status</Button>
        </section>
      </>
    );
  }

  const phase = campusPhase(attempt.currentPhase);
  return (
    <QuestShell
      phase={phase}
      completedPhases={completedPhases(attempt.currentPhase)}
      visitedConcepts={attempt.visitedConcepts}
      lastAcknowledgement={acknowledgement}
      resumed
    >
      {item ? (
        <>
          <MissionCard item={item} onSubmit={submitResponse} />
          {response ? (
            <nav className="preview-nav" aria-label="Campus route">
              <Button onClick={() => void continueRoute()}>
                Continue campus route
              </Button>
            </nav>
          ) : null}
        </>
      ) : prompt ? (
        <ReflectionCard
          attemptId={attempt.attemptId}
          prompt={prompt}
          onSubmit={async ({ choice, note }) => {
            await gateway.completeQuest({
              attemptId: attempt.attemptId,
              idempotencyKey: crypto.randomUUID(),
              reflectionChoice: choice,
              ...(note ? { reflectionNote: note } : {}),
            });
            setResults(
              await gateway.loadResults(attempt.attemptId, attempt.cohortId),
            );
          }}
        />
      ) : (
        <section className="quest-stage__placeholder">
          <h2>Preparing the next campus activity</h2>
          <p>Your confirmed work is saved. Check again in a moment.</p>
          <Button onClick={() => void continueRoute()}>Check quest status</Button>
        </section>
      )}
    </QuestShell>
  );
}
