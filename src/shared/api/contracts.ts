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
  classAccessId: string;
  joinCode: string;
  displayName: string;
  passcode: string;
  wantsLeader: boolean;
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

export interface StudentLoginInput {
  classAccessId: string;
  displayName: string;
  passcode: string;
  requestKey: string;
}

export interface StudentLoginOutput extends SessionTokens {
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
  requestKey: string;
}

export interface OpenJoinWindowInput {
  action: "open";
  cohortId: string;
  requestKey: string;
}

export interface TeacherCohortListItem {
  cohortId: string;
  title: string;
  groupCount: number;
  groupCapacity: number;
  createdAt: string;
}

export interface TeacherGroupJoinCode {
  groupId: string;
  groupNumber: number;
  joinCode: string;
  enabled: boolean;
}

export interface JoinWindowReceipt {
  joinUrl: string;
  studentUrl: string;
  expiresAt: string;
  groups: TeacherGroupJoinCode[];
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

export interface TeacherMissedQuestion {
  itemId: string;
  incorrectResponses: number;
  responses: number;
}

export interface TeacherConceptFocus {
  conceptId: ConceptId;
  missedStudents: number;
  studentCount: number;
  missedQuestions: TeacherMissedQuestion[];
}

export interface TeacherTeamScore {
  groupId: string;
  groupNumber: number;
  displayName: string;
  score: number | null;
  completedMembers: number;
  enrolledMembers: number;
  conceptFocus?: TeacherConceptFocus | null;
}

export interface TeacherDashboardSummary {
  cohortId: string;
  enrolled: number;
  active: number;
  completed: number;
  conceptAggregates: ConceptAggregate[];
  mostMissed: MissedItemAggregate[];
  classFocus?: TeacherConceptFocus | null;
  teamScores: TeacherTeamScore[];
  generatedAt: string;
}

export type TeacherStudentActivityStatus =
  | "joined"
  | "started"
  | "incomplete"
  | "submitted";

export interface TeacherRosterStudent {
  studentId: string;
  displayName: string;
  isGroupLeader: boolean;
  joinedAt: string;
  lastActiveAt: string | null;
  activityStatus: TeacherStudentActivityStatus;
  currentPhase: LearningPhase | null;
}

export interface TeacherReadinessGroup {
  groupId: string;
  groupNumber: number;
  displayName: string;
  capacity: number;
  joinCode: string | null;
  joinEnabled: boolean;
  students: TeacherRosterStudent[];
}

export interface ClassroomReadinessReport {
  cohortId: string;
  title: string;
  expected: number;
  joined: number;
  active: number;
  started: number;
  submitted: number;
  incomplete: number;
  errors: number;
  joining: {
    open: boolean;
    expiresAt: string | null;
    studentUrl: string;
  };
  groups: TeacherReadinessGroup[];
}

export interface TeacherQuestionBankEntry {
  itemId: string;
  conceptId: ConceptId;
  form: "diagnostic" | "practice" | "final";
  stem: string;
  interaction: LearningInteractionPayload;
  correctResponse: string[] | Record<string, string>;
  rationale: string;
  sourcePageLabels: string[];
}

export interface TeacherQuestionBank {
  versionKey: string;
  itemCount: 24;
  conceptCount: 8;
  items: TeacherQuestionBankEntry[];
}

export type TeacherControlCommand =
  | { action: "open-join"; cohortId: string }
  | { action: "close-join"; cohortId: string }
  | { action: "launch-quest"; cohortId: string }
  | {
      action: "set-group-join";
      cohortId: string;
      groupId: string;
      enabled: boolean;
    }
  | {
      action: "move-student";
      cohortId: string;
      studentId: string;
      groupId: string;
    }
  | {
      action: "remove-student" | "reset-student";
      cohortId: string;
      studentId: string;
    }
  | {
      action: "issue-recovery";
      cohortId: string;
      studentId: string;
    }
  | {
      action: "transfer-editor";
      cohortId: string;
      groupId: string;
      studentId: string;
    }
  | {
      action: "set-group-lock";
      cohortId: string;
      groupId: string;
      locked: boolean;
    }
  | {
      action: "set-quest-starts";
      cohortId: string;
      allowed: boolean;
    }
  | {
      action: "extend-phase";
      cohortId: string;
      phase: LearningPhase;
      seconds: number;
    }
  | { action: "close-session"; cohortId: string };

export interface TeacherControlReceipt {
  affected: number;
  expiresAt?: string;
  actionState?: string;
  joinUrl?: string;
  recoveryUrl?: string;
}

export type CohortExportType = "summary" | "teacher-private";

export interface TeacherStudentDetail {
  studentId: string;
  realName: string;
  nickname: string;
  groupName: string;
  concepts: Array<{
    conceptId: ConceptId;
    first: SupportState | "no_evidence";
    final: SupportState | "no_evidence";
    retry: string;
  }>;
  outcomes: Array<{
    itemLabel: string;
    correct: boolean;
    misconceptionTag: string | null;
  }>;
  reflection: string | null;
}
