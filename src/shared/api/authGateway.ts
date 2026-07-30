import type {
  JoinCohortInput,
  JoinCohortOutput,
  ManageJoinWindowInput,
  RecoverStudentInput,
  RecoverStudentOutput,
} from "./contracts";
import { getSupabaseClient } from "./supabase";

export interface CreateCohortRequest {
  title: string;
  groupCount: number;
  groupCapacity: number;
  requestKey: string;
}

export interface AuthGateway {
  signInTeacher(email: string, password: string): Promise<void>;
  createCohort(input: CreateCohortRequest): Promise<{ cohortId: string }>;
  openJoinWindow?(
    cohortId: string,
    requestKey: string,
  ): Promise<{ joinUrl: string; expiresAt: string }>;
  closeJoinWindow?(cohortId: string, requestKey: string): Promise<void>;
  joinCohort(input: JoinCohortInput): Promise<JoinCohortOutput>;
  recoverStudent(input: RecoverStudentInput): Promise<RecoverStudentOutput>;
}

async function invokeJoinManager(
  input: ManageJoinWindowInput,
): Promise<Record<string, unknown>> {
  const result = await getSupabaseClient().functions.invoke(
    "manage-join-window",
    { body: input },
  );
  if (result.error) throw new Error("The secure cohort request was rejected.");
  return result.data as Record<string, unknown>;
}

export const supabaseAuthGateway: AuthGateway = {
  async signInTeacher(email, password) {
    const client = getSupabaseClient();
    const result = await client.auth.signInWithPassword({ email, password });
    if (result.error || !result.data.user) {
      throw new Error("Sign-in was not accepted.");
    }
    if (result.data.user.app_metadata.role !== "teacher") {
      await client.auth.signOut();
      throw new Error("Sign-in was not accepted.");
    }
  },
  async createCohort(input) {
    const data = await invokeJoinManager({
      action: "create-cohort",
      title: input.title,
      groupCount: input.groupCount,
      groupCapacity: input.groupCapacity,
      requestKey: input.requestKey,
    });
    const cohortValue = data.cohort;
    const cohort = Array.isArray(cohortValue) ? cohortValue[0] : cohortValue;
    if (!cohort || typeof cohort !== "object" || !("id" in cohort)) {
      throw new Error("Cohort creation did not return a receipt.");
    }
    return { cohortId: String(cohort.id) };
  },
  async openJoinWindow(cohortId, requestKey) {
    const data = await invokeJoinManager({
      action: "open",
      cohortId,
      requestKey,
    });
    if (
      typeof data.joinUrl !== "string" ||
      typeof data.expiresAt !== "string"
    ) {
      throw new Error("Join window did not return a receipt.");
    }
    return { joinUrl: data.joinUrl, expiresAt: data.expiresAt };
  },
  async closeJoinWindow(cohortId, requestKey) {
    await invokeJoinManager({
      action: "close",
      cohortId,
      requestKey,
    });
  },
  async joinCohort(input) {
    const client = getSupabaseClient();
    const result = await client.functions.invoke("join-cohort", {
      body: input,
    });
    if (result.error) throw new Error("The join request was not accepted.");
    const output = result.data as JoinCohortOutput;
    const session = await client.auth.setSession({
      access_token: output.accessToken,
      refresh_token: output.refreshToken,
    });
    if (session.error) throw new Error("The student session could not be saved.");
    return output;
  },
  async recoverStudent(input) {
    const client = getSupabaseClient();
    const result = await client.functions.invoke("recover-student", {
      body: { action: "redeem", ...input },
    });
    if (result.error) throw new Error("The recovery link was not accepted.");
    const output = result.data as RecoverStudentOutput;
    const session = await client.auth.setSession({
      access_token: output.accessToken,
      refresh_token: output.refreshToken,
    });
    if (session.error) throw new Error("The recovered session could not be saved.");
    return output;
  },
};
