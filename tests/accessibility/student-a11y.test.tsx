import { cleanup, render } from "@testing-library/react";
import { axe } from "jest-axe";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { GroupStudio } from "../../src/features/group/GroupStudio";
import { JoinPage } from "../../src/features/join/JoinPage";
import { PersonalDebrief } from "../../src/features/results/PersonalDebrief";
import { ReflectionCard } from "../../src/features/results/ReflectionCard";
import { TeamLeaderboard } from "../../src/features/results/TeamLeaderboard";
import { MissionCard } from "../../src/features/quest/MissionCard";
import { QuestShell } from "../../src/features/quest/QuestShell";
import type { AuthGateway } from "../../src/shared/api/authGateway";
import type {
  ConceptId,
  LearningItemPayload,
  LearningPhase,
  ResponseResult,
} from "../../src/shared/api/contracts";

async function expectNoSeriousViolations(container: HTMLElement) {
  const result = await axe(container);
  expect(
    result.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    ),
  ).toEqual([]);
}

const authGateway: AuthGateway = {
  async signInTeacher() {},
  async createCohort() {
    return { cohortId: "cohort-1" };
  },
  async openJoinWindow() {
    throw new Error("unused");
  },
  async joinCohort(input) {
    return {
      identity: {
        studentId: "student-1",
        cohortId: "cohort-1",
        groupId: "group-1",
        groupNumber: 1,
        nickname: input.displayName,
        isGroupIdentityEditor: true,
      },
      accessToken: "access",
      refreshToken: "refresh",
    };
  },
  async loginStudent(input) {
    return {
      identity: {
        studentId: "student-1",
        cohortId: "cohort-1",
        groupId: "group-1",
        groupNumber: 1,
        nickname: input.displayName,
        isGroupIdentityEditor: false,
      },
      accessToken: "access",
      refreshToken: "refresh",
    };
  },
  async recoverStudent() {
    throw new Error("unused");
  },
};

const result: ResponseResult = {
  responseId: "response-1",
  correct: true,
  formative: false,
  explanation: "The synthetic choice links purpose to responsible action.",
  misconceptionTag: null,
  conceptState: "secure",
  nextPhase: "mission",
};

function syntheticItem(phase: LearningPhase): LearningItemPayload {
  return {
    assignmentId: `synthetic-${phase}`,
    itemId: `synthetic-${phase}-C1`,
    conceptId: "C1",
    phase,
    formative: phase === "retry",
    stem: "Which choice best connects purpose, people, and impact?",
    interaction: {
      kind: "single-choice",
      options: [
        { id: "A", text: "Review all three before acting" },
        { id: "B", text: "Focus on speed alone" },
      ],
    },
    support: { sourcePageLabel: "Synthetic review item" },
  };
}

afterEach(() => cleanup());

it("has no serious accessibility violations in both class entry modes and Group Studio states", async () => {
  const router = createMemoryRouter(
    [{ path: "/class/:classAccessId", element: <JoinPage gateway={authGateway} /> }],
    { initialEntries: ["/class/40000000-0000-4000-8000-000000000099"] },
  );
  const join = render(<RouterProvider router={router} />);
  await expectNoSeriousViolations(join.container);
  join.getByRole("button", { name: /log back in/i }).click();
  await expectNoSeriousViolations(join.container);
  cleanup();

  const studio = render(
    <GroupStudio
      group={{
        groupId: "group-1",
        groupNumber: 1,
        displayName: "Future Makers",
        imageObjectPath: null,
        lockedAt: null,
      }}
      currentStudentId="student-1"
      isEditor
      members={[
        { studentId: "student-1", nickname: "Bright Comet" },
        { studentId: "student-2", nickname: "Silver Fern" },
      ]}
    />,
  );
  await expectNoSeriousViolations(studio.container);
});

it.each(["diagnostic", "mission", "final"] as const)(
  "has no serious accessibility violations in the %s interaction state",
  async (phase) => {
    const view = render(
      <QuestShell
        phase={phase === "mission" ? "mission" : phase}
        completedPhases={phase === "diagnostic" ? ["briefing"] : ["briefing", "diagnostic"]}
        visitedConcepts={phase === "diagnostic" ? ["C1"] : ["C1", "C2"]}
        deadline="2026-07-31T09:00:00.000Z"
        now={new Date("2026-07-31T08:55:00.000Z")}
      >
        <MissionCard item={syntheticItem(phase)} onSubmit={async () => result} />
      </QuestShell>,
    );
    await expectNoSeriousViolations(view.container);
  },
);

it("has no serious accessibility violations in reflection and leaderboard states", async () => {
  const concepts = Array.from({ length: 8 }, (_, index) => ({
    conceptId: `C${index + 1}` as ConceptId,
    firstEvidence: "developing" as const,
    finalEvidence: "secure" as const,
    retryStatus: "not-needed" as const,
  }));
  const view = render(
    <main className="quest-stack">
      <PersonalDebrief explorerNickname="Bright Comet" concepts={concepts} />
      <ReflectionCard
        attemptId="a11y-attempt"
        prompt={{
          conceptId: "C8",
          prompt: "Where could you apply this idea?",
          choices: ["apply", "discuss", "revisit"],
          noteMaxLength: 240,
        }}
        onSubmit={async () => {}}
      />
      <TeamLeaderboard
        teams={[
          {
            groupId: "g1",
            groupName: "Future Makers",
            score: 84,
            completionStatus: "complete",
          },
        ]}
      />
    </main>,
  );
  await expectNoSeriousViolations(view.container);
});
