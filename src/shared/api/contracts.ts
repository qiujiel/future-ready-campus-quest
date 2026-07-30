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
