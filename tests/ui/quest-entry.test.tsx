import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QuestEntryPage } from "../../src/features/quest/QuestEntryPage";
import type {
  StudentQuestAttempt,
  StudentQuestContext,
  StudentQuestGateway,
} from "../../src/features/quest/studentQuestGateway";
import type { GroupStudioGateway } from "../../src/features/group/groupStudioGateway";
import type {
  ConceptId,
  LearningItemPayload,
  QuestCompletionResult,
  ResponseResult,
} from "../../src/shared/api/contracts";

const context: StudentQuestContext = {
  identity: {
    studentId: "student-1",
    cohortId: "cohort-1",
    groupId: "group-1",
    groupNumber: 2,
    nickname: "Bright Comet",
    isGroupIdentityEditor: true,
  },
  group: {
    groupId: "group-1",
    groupNumber: 2,
    displayName: "Future Makers",
    imageObjectPath: null,
    lockedAt: null,
  },
  members: [
    { studentId: "student-1", nickname: "Bright Comet" },
    { studentId: "student-2", nickname: "Silver Fern" },
  ],
};

const item: LearningItemPayload = {
  assignmentId: "assignment-C1",
  itemId: "item-C1",
  conceptId: "C1",
  phase: "diagnostic",
  formative: false,
  stem: "Which choice starts with a clear learning purpose?",
  interaction: {
    kind: "single-choice",
    options: [
      { id: "A", text: "Name the learner goal first" },
      { id: "B", text: "Choose a tool first" },
    ],
  },
  support: {},
};

const response: ResponseResult = {
  responseId: "response-1",
  correct: true,
  formative: false,
  explanation: "A learner goal gives the plan a clear purpose.",
  misconceptionTag: null,
  conceptState: "secure",
  nextPhase: "reflection",
};

const completion: QuestCompletionResult = {
  attemptId: "attempt-1",
  diagnostic: { correct: 8, total: 8 },
  final: { correct: 8, total: 8 },
  retry: { correct: 0, total: 0 },
  retryFormative: true,
  finalMastery: 100,
  improvement: 25,
  missionCompletion: 100,
  reflectionCompletion: 100,
  individualContribution: 86,
  formulaVersion: "team-score-60-25-10-5-v1",
  reflectionPromptConceptId: "C1",
};

function activeAttempt(
  currentPhase: StudentQuestAttempt["currentPhase"] = "diagnostic",
): StudentQuestAttempt {
  return {
    attemptId: "attempt-1",
    cohortId: "cohort-1",
    status: "active",
    currentPhase,
    lastAcceptedSequence: currentPhase === "reflection" ? 1 : 0,
    phaseDeadlineAt: "2030-01-01T09:05:00.000Z",
    visitedConcepts: currentPhase === "reflection" ? ["C1"] : [],
  };
}

function groupGateway(): GroupStudioGateway {
  return {
    async rename(_groupId, displayName) {
      return { ...context.group, displayName };
    },
    async uploadImage() {
      return context.group;
    },
    async getImageUrl() {
      return null;
    },
  };
}

function journeyGateway(): StudentQuestGateway {
  let attempt = activeAttempt();
  return {
    async loadContext() {
      return context;
    },
    async findLatestAttempt() {
      return attempt;
    },
    async getAttemptState() {
      return attempt;
    },
    async getNextItem() {
      return attempt.currentPhase === "diagnostic" ? item : null;
    },
    async submitResponse() {
      attempt = activeAttempt("reflection");
      return response;
    },
    async getReflectionPrompt() {
      return {
        conceptId: "C1",
        prompt: "Where will you use this planning habit next?",
        choices: ["apply", "discuss", "revisit"],
        noteMaxLength: 240,
      };
    },
    async completeQuest() {
      attempt = { ...attempt, status: "completed" };
      return completion;
    },
    async resumeAttempt() {
      return { status: "resumed", attempt, item };
    },
    async loadResults() {
      return {
        concepts: Array.from({ length: 8 }, (_, index) => ({
          conceptId: `C${index + 1}` as ConceptId,
          firstEvidence: "developing" as const,
          finalEvidence: "secure" as const,
          retryStatus: "not-needed" as const,
        })),
        teams: [
          {
            groupId: "group-1",
            groupName: "Future Makers",
            score: 86,
            completionStatus: "complete" as const,
          },
        ],
      };
    },
  };
}

it("runs an authenticated attempt through feedback, reflection, and private results", async () => {
  render(
    <QuestEntryPage
      gateway={journeyGateway()}
      groupGateway={groupGateway()}
    />,
  );

  expect(
    await screen.findByRole("heading", { name: "Diagnostic Gate" }),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole("radio", { name: "Name the learner goal first" }),
  );
  fireEvent.click(screen.getByRole("button", { name: /confirm response/i }));
  expect(await screen.findByText("Correct")).toBeVisible();

  fireEvent.click(
    screen.getByRole("button", { name: /continue campus route/i }),
  );
  expect(
    await screen.findByRole("heading", { name: /carry one idea forward/i }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("radio", { name: /apply it/i }));
  fireEvent.click(screen.getByRole("button", { name: /finish reflection/i }));

  expect(
    await screen.findByRole("heading", { name: /bright comet.*growth route/i }),
  ).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "Campus team board" }),
  ).toBeVisible();
  expect(screen.queryByText("Silver Fern")).not.toBeInTheDocument();
});

it("shows Group Studio while waiting and resumes when a server attempt appears", async () => {
  let attempt: StudentQuestAttempt | null = null;
  const gateway = journeyGateway();
  gateway.findLatestAttempt = vi.fn(async () => attempt);
  gateway.getNextItem = vi.fn(async () => item);
  render(
    <QuestEntryPage gateway={gateway} groupGateway={groupGateway()} />,
  );

  expect(
    await screen.findByRole("heading", { name: "Future Makers" }),
  ).toBeVisible();
  expect(screen.getByText(/waiting for your teacher to open/i)).toBeVisible();

  attempt = activeAttempt();
  fireEvent.click(screen.getByRole("button", { name: /check quest status/i }));

  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: "Diagnostic Gate" }),
    ).toBeVisible(),
  );
});

it("finishes the initial item request before starting reconciliation", async () => {
  let resolveItem: (value: LearningItemPayload) => void = () => undefined;
  const itemPending = new Promise<LearningItemPayload>((resolve) => {
    resolveItem = resolve;
  });
  const gateway = journeyGateway();
  gateway.getNextItem = vi.fn(() => itemPending);
  const queue = {
    enqueue: vi.fn(async () => undefined),
    flush: vi.fn(async () => undefined),
  };

  render(
    <QuestEntryPage
      gateway={gateway}
      groupGateway={groupGateway()}
      queue={queue}
    />,
  );

  await waitFor(() => expect(gateway.getNextItem).toHaveBeenCalledTimes(1));
  expect(queue.flush).not.toHaveBeenCalled();
  await act(async () => resolveItem(item));
  expect(
    await screen.findByRole("heading", { name: "Diagnostic Gate" }),
  ).toBeVisible();
  await waitFor(() => expect(queue.flush).toHaveBeenCalled());
});

it("keeps an in-progress answer selected during background reconciliation", async () => {
  let resolveFlush: () => void = () => undefined;
  const flushPending = new Promise<void>((resolve) => {
    resolveFlush = resolve;
  });
  let resolveRefresh: (value: LearningItemPayload) => void = () => undefined;
  const refreshPending = new Promise<LearningItemPayload>((resolve) => {
    resolveRefresh = resolve;
  });
  const gateway = journeyGateway();
  gateway.getNextItem = vi.fn()
    .mockResolvedValueOnce(item)
    .mockImplementationOnce(() => refreshPending);
  const queue = {
    enqueue: vi.fn(async () => undefined),
    flush: vi.fn(() => flushPending),
  };

  render(
    <QuestEntryPage
      gateway={gateway}
      groupGateway={groupGateway()}
      queue={queue}
    />,
  );

  await screen.findByRole("heading", { name: "Diagnostic Gate" });
  fireEvent.click(
    screen.getByRole("radio", { name: "Name the learner goal first" }),
  );
  expect(screen.getByRole("button", { name: /confirm response/i }))
    .toBeEnabled();

  await act(async () => resolveFlush());
  await waitFor(() => expect(gateway.getNextItem).toHaveBeenCalledTimes(2));

  expect(
    screen.getByRole("radio", { name: "Name the learner goal first" }),
  ).toBeChecked();
  expect(screen.getByRole("button", { name: /confirm response/i }))
    .toBeEnabled();
  await act(async () => resolveRefresh(item));
});

it("explains an expired session without exposing technical details", async () => {
  const gateway = journeyGateway();
  gateway.loadContext = vi.fn(async () => {
    throw new Error("STUDENT_SESSION_NOT_AVAILABLE");
  });
  render(<QuestEntryPage gateway={gateway} groupGateway={groupGateway()} />);

  expect(
    await screen.findByRole("heading", {
      name: /your campus place needs attention/i,
    }),
  ).toBeVisible();
  expect(screen.getByText(/student session has expired/i)).toBeVisible();
  expect(screen.getByText(/ask your teacher for a recovery link/i)).toBeVisible();
  expect(screen.queryByText(/STUDENT_SESSION/i)).not.toBeInTheDocument();
});

it("keeps confirmed feedback visible until the student chooses to continue", async () => {
  render(
    <QuestEntryPage
      gateway={journeyGateway()}
      groupGateway={groupGateway()}
      pollIntervalMs={10}
    />,
  );
  await screen.findByRole("heading", { name: "Diagnostic Gate" });
  fireEvent.click(
    screen.getByRole("radio", { name: "Name the learner goal first" }),
  );
  fireEvent.click(screen.getByRole("button", { name: /confirm response/i }));
  expect(await screen.findByText("Correct")).toBeVisible();

  await new Promise((resolve) => window.setTimeout(resolve, 40));

  expect(screen.getByText("Correct")).toBeVisible();
  expect(
    screen.getByRole("button", { name: /continue campus route/i }),
  ).toBeVisible();
});
