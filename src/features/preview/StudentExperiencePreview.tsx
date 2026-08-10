import { useState } from "react";
import type { AuthGateway } from "../../shared/api/authGateway";
import type {
  ConceptId,
  JoinCohortOutput,
  LearningItemPayload,
  PublicGroupIdentity,
  ResponseResult,
} from "../../shared/api/contracts";
import { Button } from "../../ui/Button";
import { GroupStudio } from "../group/GroupStudio";
import type { GroupStudioGateway } from "../group/groupStudioGateway";
import { JoinPage } from "../join/JoinPage";
import { MissionCard } from "../quest/MissionCard";
import { QuestShell } from "../quest/QuestShell";
import { PersonalDebrief } from "../results/PersonalDebrief";
import { ReflectionCard } from "../results/ReflectionCard";
import { TeamLeaderboard } from "../results/TeamLeaderboard";

const syntheticGroup: PublicGroupIdentity = {
  groupId: "60000000-0000-4000-8000-000000000002",
  groupNumber: 2,
  displayName: "Future Makers",
  imageObjectPath: null,
  lockedAt: null,
};

const previewAuthGateway: AuthGateway = {
  async signInTeacher() {},
  async createCohort() {
    return { cohortId: "preview-cohort" };
  },
  async openJoinWindow() {
    throw new Error("Preview class creation is not available.");
  },
  async joinCohort(input) {
    return {
      identity: {
        studentId: "preview-student",
        cohortId: "preview-cohort",
        groupId: syntheticGroup.groupId,
        groupNumber: 2,
        nickname: input.displayName,
        isGroupIdentityEditor: true,
      },
      accessToken: "preview-only",
      refreshToken: "preview-only",
    };
  },
  async loginStudent(input) {
    return {
      identity: {
        studentId: "preview-student",
        cohortId: "preview-cohort",
        groupId: syntheticGroup.groupId,
        groupNumber: 2,
        nickname: input.displayName,
        isGroupIdentityEditor: true,
      },
      accessToken: "preview-only",
      refreshToken: "preview-only",
    };
  },
  async recoverStudent() {
    throw new Error("Preview recovery is not available.");
  },
};

const previewGroupGateway: GroupStudioGateway = {
  async rename(_groupId, displayName) {
    return { ...syntheticGroup, displayName };
  },
  async uploadImage(_groupId, _file, onProgress) {
    onProgress(100);
    return {
      ...syntheticGroup,
      imageObjectPath: "preview/future-makers.webp",
    };
  },
  async getImageUrl() {
    return null;
  },
};

const previewItem: LearningItemPayload = {
  assignmentId: "preview-mission-C4",
  itemId: "preview-item-C4",
  conceptId: "C4",
  phase: "mission",
  formative: false,
  stem: "Which action makes a future-ready learning plan stronger?",
  interaction: {
    kind: "single-choice",
    options: [
      {
        id: "A",
        text: "Review purpose, people, and possible impact",
      },
      {
        id: "B",
        text: "Choose the fastest tool without reviewing the context",
      },
    ],
  },
  support: {
    conceptReminder:
      "Strong plans connect a clear purpose to people and possible impact.",
    sourcePageLabel: "Synthetic Gate C review item",
  },
};

const previewResult: ResponseResult = {
  responseId: "preview-response",
  correct: true,
  formative: false,
  explanation:
    "Reviewing purpose, people, and impact makes the plan easier to explain and improve.",
  misconceptionTag: null,
  conceptState: "secure",
  nextPhase: "mission",
};

const conceptResults = Array.from({ length: 8 }, (_, index) => ({
  conceptId: `C${index + 1}` as ConceptId,
  firstEvidence: index < 3 ? ("needs_support" as const) : ("developing" as const),
  finalEvidence: index < 6 ? ("secure" as const) : ("developing" as const),
  retryStatus: index === 7 ? ("ready" as const) : ("not-needed" as const),
}));

type PreviewStep =
  | "join"
  | "studio"
  | "briefing"
  | "diagnostic"
  | "map"
  | "mission"
  | "results";
const previewNow = new Date("2030-01-01T09:00:00.000Z");
const previewDeadline = "2030-01-01T09:05:00.000Z";

export function StudentExperiencePreview() {
  const [step, setStep] = useState<PreviewStep>("join");
  const [identity, setIdentity] = useState<JoinCohortOutput["identity"] | null>(
    null,
  );
  const [missionComplete, setMissionComplete] = useState(false);

  if (step === "join") {
    return (
      <>
        <p className="preview-banner">
          Gate C review mode · synthetic content · no login required
        </p>
        <JoinPage
          gateway={previewAuthGateway}
          classAccessId="40000000-0000-4000-8000-000000000099"
          onJoined={(joined) => {
            setIdentity(joined.identity);
            setStep("studio");
          }}
        />
      </>
    );
  }

  if (step === "studio") {
    return (
      <div className="preview-screen">
        <p className="preview-banner">
          Gate C review mode · synthetic content · no changes are saved
        </p>
        <GroupStudio
          group={syntheticGroup}
          members={[
            {
              studentId: "preview-student",
              nickname: identity?.nickname ?? "Bright Comet",
            },
            { studentId: "preview-peer", nickname: "Silver Fern" },
          ]}
          currentStudentId="preview-student"
          isEditor
          gateway={previewGroupGateway}
        />
        <nav className="preview-nav quest-content" aria-label="Review journey">
          <Button onClick={() => setStep("briefing")}>
            Continue to campus map
          </Button>
        </nav>
      </div>
    );
  }

  if (step === "briefing") {
    return (
      <QuestShell
        phase="briefing"
        completedPhases={[]}
        visitedConcepts={[]}
        deadline={previewDeadline}
        now={previewNow}
      >
        <section className="preview-callout">
          <p className="eyebrow">Meet your crew</p>
          <h2>Welcome, Future Makers</h2>
          <p>
            Your teacher guides the class through each destination. Discuss
            ideas with your crew, then make your own thoughtful choices.
          </p>
          <Button onClick={() => setStep("diagnostic")}>
            Enter Diagnostic Gate
          </Button>
        </section>
      </QuestShell>
    );
  }

  if (step === "diagnostic") {
    return (
      <QuestShell
        phase="diagnostic"
        completedPhases={["briefing"]}
        visitedConcepts={[]}
        deadline={previewDeadline}
        now={previewNow}
      >
        <section className="preview-callout">
          <p className="eyebrow">Route check</p>
          <h2>Find your best starting path</h2>
          <p>
            The live quest uses a short baseline check to choose useful
            support. It guides your route and never ranks you against
            classmates.
          </p>
          <Button onClick={() => setStep("map")}>
            Continue to Learning Labs
          </Button>
        </section>
      </QuestShell>
    );
  }

  if (step === "map") {
    return (
      <QuestShell
        phase="mission"
        completedPhases={["briefing", "diagnostic"]}
        visitedConcepts={["C1", "C2", "C3"]}
        deadline={previewDeadline}
        now={previewNow}
      >
        <section className="preview-callout">
          <p className="eyebrow">Learning Lab 1 of 6</p>
          <h2>Responsible planning studio</h2>
          <p>
            Explore one synthetic mission to review interaction and feedback.
          </p>
          <Button onClick={() => setStep("mission")}>Open mission</Button>
        </section>
      </QuestShell>
    );
  }

  if (step === "mission") {
    return (
      <QuestShell
        phase="mission"
        completedPhases={["briefing", "diagnostic"]}
        visitedConcepts={["C1", "C2", "C3", "C4"]}
        deadline={previewDeadline}
        now={previewNow}
      >
        <MissionCard
          item={previewItem}
          onSubmit={async () => {
            if (!navigator.onLine) throw new Error("preview-offline");
            setMissionComplete(true);
            return previewResult;
          }}
        />
        {missionComplete ? (
          <nav className="preview-nav" aria-label="Review journey">
            <Button onClick={() => setStep("results")}>View results</Button>
          </nav>
        ) : null}
      </QuestShell>
    );
  }

  return (
    <main className="preview-results quest-content">
      <p className="preview-banner">
        Gate C review mode · private and team-safe result examples
      </p>
      <header className="preview-results__header">
        <p className="eyebrow">Reflection Garden</p>
        <h1>Your quest debrief</h1>
        <p>Review growth privately, then celebrate team progress together.</p>
      </header>
      <PersonalDebrief
        explorerNickname={identity?.nickname ?? "Bright Comet"}
        concepts={conceptResults}
      />
      <ReflectionCard
        attemptId="preview-attempt"
        prompt={{
          conceptId: "C8",
          prompt: "Where could your group apply this planning habit next?",
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
            score: 88,
            completionStatus: "complete",
          },
          {
            groupId: "g2",
            groupName: "Bright Builders",
            score: 88,
            completionStatus: "complete",
          },
          {
            groupId: "g3",
            groupName: "Curious Crew",
            score: null,
            completionStatus: "awaiting",
          },
        ]}
      />
      <nav className="preview-nav" aria-label="Review journey">
        <Button
          variant="secondary"
          onClick={() => {
            setIdentity(null);
            setMissionComplete(false);
            setStep("join");
          }}
        >
          Restart review
        </Button>
      </nav>
    </main>
  );
}
