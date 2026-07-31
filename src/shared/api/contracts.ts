export type Role = "teacher" | "student";
export type ConceptId =
  | "C1"
  | "C2"
  | "C3"
  | "C4"
  | "C5"
  | "C6"
  | "C7"
  | "C8";
export type SupportState = "needs_support" | "developing" | "secure";
export type LearningPhase =
  | "diagnostic"
  | "mission"
  | "final"
  | "retry"
  | "reflection";

export interface JoinCohortInput {
  joinToken: string;
  groupNumber: number;
  realName: string;
  nickname?: string;
  privacyConfirmed: boolean;
  requestKey: string;
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface StudentIdentity {
  studentId: string;
  cohortId: string;
  groupId: string;
  groupNumber: number;
  nickname: string;
  isGroupIdentityEditor: boolean;
}

export interface JoinCohortOutput extends SessionTokens {
  identity: StudentIdentity;
}

export interface PublicGroupIdentity {
  groupId: string;
  groupNumber: number;
  displayName: string;
  imageObjectPath: string | null;
  lockedAt: string | null;
}

export interface CreateCohortInput {
  action: "create-cohort";
  title: string;
  groupCount: number;
  groupCapacity: number;
  requestKey: string;
}

export interface OpenJoinWindowInput {
  action: "open";
  cohortId: string;
  requestKey: string;
}

export interface CloseJoinWindowInput {
  action: "close";
  cohortId: string;
  requestKey: string;
}

export type ManageJoinWindowInput =
  | CreateCohortInput
  | OpenJoinWindowInput
  | CloseJoinWindowInput;

export interface RecoverStudentInput {
  recoveryToken: string;
  requestKey: string;
}

export interface RecoverStudentOutput extends SessionTokens {
  studentId: string;
}

export type GroupIdentityCommand =
  | {
      action: "rename";
      groupId: string;
      displayName: string;
      requestKey: string;
    }
  | {
      action: "transfer-editor";
      groupId: string;
      nextEditorId: string;
      requestKey: string;
    }
  | {
      action: "lock" | "unlock";
      groupId: string;
      requestKey: string;
    };

export type LearningInteractionPayload =
  | {
      kind: "single-choice" | "multi-select" | "scenario-sort";
      options: Array<{ id: string; text: string }>;
    }
  | {
      kind: "classification";
      prompts: Array<{ id: string; text: string }>;
      categories: string[];
    };

export interface LearningItemPayload {
  assignmentId: string;
  itemId: string;
  conceptId: ConceptId;
  phase: LearningPhase;
  formative: boolean;
  stem: string;
  interaction: LearningInteractionPayload;
  support: {
    conceptReminder?: string;
    sourcePageLabel?: string;
  };
}

export interface ResponseSubmission {
  attemptId: string;
  assignmentId: string;
  idempotencyKey: string;
  selectedOptionIds: string[];
  clientSequence: number;
  confidence?: "unsure" | "somewhat_sure" | "very_sure";
}

export interface ResponseResult {
  responseId: string;
  correct: boolean;
  formative: boolean;
  explanation: string;
  misconceptionTag: string | null;
  conceptState: SupportState;
  nextPhase: LearningPhase;
}

export type ReflectionChoice = "apply" | "discuss" | "revisit";

export interface ReflectionPrompt {
  conceptId: ConceptId;
  prompt: string;
  choices: ReflectionChoice[];
  noteMaxLength: 240;
}

export interface CompleteQuestInput {
  attemptId: string;
  idempotencyKey: string;
  reflectionChoice: ReflectionChoice;
  reflectionNote?: string;
}

export interface QuestCompletionResult {
  attemptId: string;
  diagnostic: { correct: number; total: 8 };
  final: { correct: number; total: 8 };
  retry: { correct: number; total: number };
  retryFormative: true;
  finalMastery: number;
  improvement: number;
  missionCompletion: number;
  reflectionCompletion: 100;
  individualContribution: number;
  formulaVersion: "team-score-60-25-10-5-v1";
  reflectionPromptConceptId: ConceptId;
}

export interface AttemptState {
  attemptId: string;
  status: "active" | "completed" | "abandoned";
  currentPhase: LearningPhase;
  lastAcceptedSequence: number;
}

export type ResumeLearningResult =
  | {
      status: "resumed";
      attempt: AttemptState;
      item: LearningItemPayload | null;
    }
  | {
      status: "recovery-required";
    };

export interface EvidenceCounts {
  needs_support: number;
  developing: number;
  secure: number;
}

export interface ConceptAggregate {
  conceptId: ConceptId;
  first: EvidenceCounts;
  final: EvidenceCounts;
  retryCorrect: number;
  retryAttempted: number;
}

export interface MissedItemAggregate {
  itemId: string;
  conceptId: ConceptId;
  shortLabel: string;
  incorrectCount: number;
  responseCount: number;
  misconceptionTags: Array<{ tag: string; count: number }>;
}

export interface TeacherTeamScore {
  groupId: string;
  groupNumber: number;
  displayName: string;
  score: number | null;
  completedMembers: number;
  enrolledMembers: number;
}

export interface TeacherDashboardSummary {
  cohortId: string;
  enrolled: number;
  active: number;
  completed: number;
  conceptAggregates: ConceptAggregate[];
  mostMissed: MissedItemAggregate[];
  teamScores: TeacherTeamScore[];
  generatedAt: string;
}
