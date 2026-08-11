import { getSupabaseClient } from "../../shared/api/supabase";
import type {
  ClassroomReadinessReport,
  TeacherDashboardSummary,
  TeacherQuestionBank,
  TeacherStudentDetail,
} from "../../shared/api/contracts";

export interface TeacherGateway {
  getSummary(cohortId: string): Promise<TeacherDashboardSummary>;
  getReadiness?(cohortId: string): Promise<ClassroomReadinessReport>;
  getQuestionBank?(cohortId: string): Promise<TeacherQuestionBank>;
  getStudent?(
    cohortId: string,
    studentId: string,
  ): Promise<TeacherStudentDetail>;
  removeClass?(cohortId: string, requestKey: string): Promise<void>;
}

export class TeacherGatewayError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "TeacherGatewayError";
  }
}

async function throwTeacherGatewayError(
  context: unknown,
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
        throw new TeacherGatewayError(body.error);
      }
    } catch (error) {
      if (error instanceof TeacherGatewayError) throw error;
    }
  }
  throw new TeacherGatewayError("COHORT_NOT_AVAILABLE");
}

export const supabaseTeacherGateway: TeacherGateway = {
  async getSummary(cohortId) {
    const response = await getSupabaseClient().functions.invoke(
      "teacher-dashboard",
      { body: { cohortId } },
    );
    if (response.error) {
      await throwTeacherGatewayError(response.error.context);
    }
    const data = response.data as { summary: TeacherDashboardSummary };
    return data.summary;
  },
  async getReadiness(cohortId) {
    const response = await getSupabaseClient().functions.invoke(
      "teacher-dashboard",
      { body: { cohortId, view: "readiness" } },
    );
    if (response.error) await throwTeacherGatewayError(response.error.context);
    return (response.data as { readiness: ClassroomReadinessReport }).readiness;
  },
  async getQuestionBank(cohortId) {
    const response = await getSupabaseClient().functions.invoke(
      "teacher-dashboard",
      { body: { cohortId, view: "question-bank" } },
    );
    if (response.error) await throwTeacherGatewayError(response.error.context);
    return (response.data as { questionBank: TeacherQuestionBank }).questionBank;
  },
  async getStudent(cohortId, studentId) {
    const response = await getSupabaseClient().functions.invoke(
      "teacher-dashboard",
      { body: { cohortId, studentId } },
    );
    if (response.error) {
      await throwTeacherGatewayError(response.error.context);
    }
    const data = response.data as { student: TeacherStudentDetail };
    return data.student;
  },
  async removeClass(cohortId, requestKey) {
    const client = getSupabaseClient();
    const archived = await client.rpc("archive_teacher_cohort", {
      p_cohort_id: cohortId,
      p_request_key: requestKey,
    });
    if (archived.error) throw new TeacherGatewayError("CLASS_NOT_REMOVED");
    const anonymized = await client.rpc("purge_archived_cohort", {
      p_cohort_id: cohortId,
      p_confirmation: `PURGE ${cohortId}`,
      p_request_key: requestKey,
    });
    if (anonymized.error) {
      throw new TeacherGatewayError("CLASS_REMOVED_CLEANUP_INCOMPLETE");
    }
  },
};
