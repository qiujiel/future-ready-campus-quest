import type {
  JoinCohortInput,
  JoinCohortOutput,
  JoinWindowReceipt,
  ManageJoinWindowInput,
  RecoverStudentInput,
  RecoverStudentOutput,
  TeacherCohortListItem,
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
  getCurrentRole?(): Promise<"teacher" | "student" | null>;
  signOut?(): Promise<void>;
  listCohorts?(): Promise<TeacherCohortListItem[]>;
  createCohort(input: CreateCohortRequest): Promise<{ cohortId: string }>;
  openJoinWindow?(
    cohortId: string,
    requestKey: string,
  ): Promise<JoinWindowReceipt>;
  closeJoinWindow?(cohortId: string, requestKey: string): Promise<void>;
  joinCohort(input: JoinCohortInput): Promise<JoinCohortOutput>;
  recoverStudent(input: RecoverStudentInput): Promise<RecoverStudentOutput>;
}

export class AuthGatewayError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export async function throwAuthGatewayError(
  context: unknown,
  fallback: string,
): Promise<never> {
  const response = context instanceof Response
    ? context
    : (
      context as {
        response?: Response;
      } | null
    )?.response;
  if (response) {
    try {
      const body = (await response.clone().json()) as { error?: unknown };
      if (typeof body.error === "string") {
        throw new AuthGatewayError(body.error);
      }
    } catch (error) {
      if (error instanceof AuthGatewayError) throw error;
    }
  }
  throw new AuthGatewayError(fallback);
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
  async getCurrentRole() {
    const result = await getSupabaseClient().auth.getUser();
    if (result.error || !result.data.user) return null;
    const role = result.data.user.app_metadata.role;
    return role === "teacher" || role === "student" ? role : null;
  },
  async signOut() {
    const result = await getSupabaseClient().auth.signOut();
    if (result.error) throw new Error("The saved session could not be ended.");
  },
  async listCohorts() {
    const result = await getSupabaseClient()
      .from("cohorts")
      .select("id,title,group_count,group_capacity,created_at")
      .order("created_at", { ascending: false });
    if (result.error) throw new Error("Cohorts could not be loaded.");
    return (result.data ?? []).map((cohort) => ({
      cohortId: String(cohort.id),
      title: String(cohort.title),
      groupCount: Number(cohort.group_count),
      groupCapacity: Number(cohort.group_capacity),
      createdAt: String(cohort.created_at),
    }));
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
      typeof data.studentUrl !== "string" ||
      typeof data.expiresAt !== "string" ||
      !Array.isArray(data.groups)
    ) {
      throw new Error("Join window did not return a receipt.");
    }
    return {
      joinUrl: data.joinUrl,
      studentUrl: data.studentUrl,
      expiresAt: data.expiresAt,
      groups: data.groups as JoinWindowReceipt["groups"],
    };
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
    if (result.error) {
      await throwAuthGatewayError(result.error.context, "JOIN_NOT_ACCEPTED");
    }
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
