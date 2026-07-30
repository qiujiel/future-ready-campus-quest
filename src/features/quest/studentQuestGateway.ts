import type { GroupMember } from "../group/GroupStudio";
import type { ConceptDebrief } from "../results/PersonalDebrief";
import type { TeamResult } from "../results/TeamLeaderboard";
import {
  supabaseLearningGateway,
  type LearningGateway,
} from "../../learning/api/learningClient";
import type {
  AttemptState,
  ConceptId,
  PublicGroupIdentity,
  StudentIdentity,
  SupportState,
} from "../../shared/api/contracts";
import { getSupabaseClient } from "../../shared/api/supabase";

export interface StudentQuestContext {
  group: PublicGroupIdentity;
  identity: StudentIdentity;
  members: GroupMember[];
}

export interface StudentQuestAttempt extends AttemptState {
  cohortId: string;
  phaseDeadlineAt: string;
  visitedConcepts: ConceptId[];
}

export interface StudentQuestResults {
  concepts: ConceptDebrief[];
  teams: TeamResult[];
}

export interface StudentQuestGateway extends LearningGateway {
  loadContext(): Promise<StudentQuestContext>;
  findLatestAttempt(): Promise<StudentQuestAttempt | null>;
  getAttemptState(attemptId: string): Promise<StudentQuestAttempt>;
  loadResults(
    attemptId: string,
    cohortId: string,
  ): Promise<StudentQuestResults>;
}

function groupFrom(row: Record<string, unknown>): PublicGroupIdentity {
  return {
    groupId: String(row.id),
    groupNumber: Number(row.group_number),
    displayName: String(row.display_name),
    imageObjectPath:
      typeof row.image_object_path === "string"
        ? row.image_object_path
        : null,
    lockedAt:
      typeof row.identity_locked_at === "string"
        ? row.identity_locked_at
        : null,
  };
}

async function visitedConcepts(attemptId: string): Promise<ConceptId[]> {
  const result = await getSupabaseClient()
    .from("concept_evidence")
    .select("concept_id")
    .eq("attempt_id", attemptId);
  if (result.error) throw new Error("QUEST_CONTEXT_NOT_AVAILABLE");
  return [
    ...new Set(
      (result.data ?? []).map(
        (row) => String(row.concept_id) as ConceptId,
      ),
    ),
  ];
}

async function attemptFrom(
  row: Record<string, unknown>,
): Promise<StudentQuestAttempt> {
  const attemptId = String(row.id);
  return {
    attemptId,
    cohortId: String(row.cohort_id),
    status: row.status as AttemptState["status"],
    currentPhase: row.current_phase as AttemptState["currentPhase"],
    lastAcceptedSequence: Number(row.last_accepted_sequence),
    phaseDeadlineAt: String(row.phase_deadline_at),
    visitedConcepts: await visitedConcepts(attemptId),
  };
}

function evidenceState(
  rows: Array<Record<string, unknown>>,
  conceptId: ConceptId,
  phase: string,
): SupportState {
  const row = rows.find(
    (candidate) =>
      candidate.concept_id === conceptId && candidate.phase === phase,
  );
  return (row?.support_state as SupportState | undefined) ?? "developing";
}

export const supabaseStudentQuestGateway: StudentQuestGateway = {
  ...supabaseLearningGateway,

  async loadContext() {
    const client = getSupabaseClient();
    const user = await client.auth.getUser();
    if (user.error || !user.data.user) {
      throw new Error("STUDENT_SESSION_NOT_AVAILABLE");
    }
    const profile = await client
      .from("student_private_profiles")
      .select("student_id,cohort_id,group_id")
      .eq("student_id", user.data.user.id)
      .single();
    if (profile.error || !profile.data) {
      throw new Error("STUDENT_CONTEXT_NOT_AVAILABLE");
    }
    const groupId = String(profile.data.group_id);
    const [groupResult, membersResult] = await Promise.all([
      client
        .from("groups")
        .select(
          "id,group_number,display_name,image_object_path,identity_locked_at,identity_editor_id",
        )
        .eq("id", groupId)
        .single(),
      client
        .from("student_public_profiles")
        .select("student_id,nickname")
        .eq("group_id", groupId)
        .order("nickname"),
    ]);
    if (groupResult.error || !groupResult.data || membersResult.error) {
      throw new Error("STUDENT_CONTEXT_NOT_AVAILABLE");
    }
    const members = (membersResult.data ?? []).map((row) => ({
      studentId: String(row.student_id),
      nickname: String(row.nickname),
    }));
    const ownProfile = members.find(
      (member) => member.studentId === user.data.user.id,
    );
    if (!ownProfile) throw new Error("STUDENT_CONTEXT_NOT_AVAILABLE");
    const group = groupFrom(groupResult.data);
    return {
      group,
      members,
      identity: {
        studentId: user.data.user.id,
        cohortId: String(profile.data.cohort_id),
        groupId,
        groupNumber: group.groupNumber,
        nickname: ownProfile.nickname,
        isGroupIdentityEditor:
          groupResult.data.identity_editor_id === user.data.user.id,
      },
    };
  },

  async findLatestAttempt() {
    const result = await getSupabaseClient()
      .from("quest_attempts")
      .select(
        "id,cohort_id,status,current_phase,last_accepted_sequence,phase_deadline_at,started_at",
      )
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (result.error) throw new Error("ATTEMPT_NOT_AVAILABLE");
    return result.data ? attemptFrom(result.data) : null;
  },

  async getAttemptState(attemptId) {
    const result = await getSupabaseClient()
      .from("quest_attempts")
      .select(
        "id,cohort_id,status,current_phase,last_accepted_sequence,phase_deadline_at",
      )
      .eq("id", attemptId)
      .single();
    if (result.error || !result.data) {
      throw new Error("ATTEMPT_NOT_AVAILABLE");
    }
    return attemptFrom(result.data);
  },

  async resumeAttempt(attemptId) {
    const session = await getSupabaseClient().auth.getSession();
    if (session.error || !session.data.session) {
      return { status: "recovery-required" };
    }
    const attempt = await this.getAttemptState(attemptId);
    const item =
      attempt.status === "active"
        ? await this.getNextItem(attemptId)
        : null;
    return { status: "resumed", attempt, item };
  },

  async loadResults(attemptId, cohortId) {
    const client = getSupabaseClient();
    const [evidenceResult, snapshotsResult, groupsResult] =
      await Promise.all([
        client
          .from("concept_evidence")
          .select("concept_id,phase,support_state")
          .eq("attempt_id", attemptId),
        client
          .from("team_score_snapshots")
          .select("group_id,team_score,completion_state")
          .eq("cohort_id", cohortId),
        client
          .from("groups")
          .select("id,display_name")
          .eq("cohort_id", cohortId),
      ]);
    if (
      evidenceResult.error ||
      snapshotsResult.error ||
      groupsResult.error
    ) {
      throw new Error("QUEST_RESULTS_NOT_AVAILABLE");
    }
    const evidence = (evidenceResult.data ?? []) as Array<
      Record<string, unknown>
    >;
    const concepts = Array.from({ length: 8 }, (_, index) => {
      const conceptId = `C${index + 1}` as ConceptId;
      const finalEvidence = evidenceState(evidence, conceptId, "final");
      const retried = evidence.some(
        (row) => row.concept_id === conceptId && row.phase === "retry",
      );
      return {
        conceptId,
        firstEvidence: evidenceState(evidence, conceptId, "diagnostic"),
        finalEvidence,
        retryStatus: retried
          ? ("complete" as const)
          : finalEvidence === "needs_support"
            ? ("ready" as const)
            : ("not-needed" as const),
      };
    });
    const names = new Map(
      (groupsResult.data ?? []).map((row) => [
        String(row.id),
        String(row.display_name),
      ]),
    );
    const teams = (snapshotsResult.data ?? []).map((row) => ({
      groupId: String(row.group_id),
      groupName: names.get(String(row.group_id)) ?? "Campus team",
      score:
        typeof row.team_score === "number" ? row.team_score : null,
      completionStatus:
        row.completion_state === "complete"
          ? ("complete" as const)
          : ("awaiting" as const),
    }));
    return { concepts, teams };
  },
};
