import { getSupabaseClient } from "../../shared/api/supabase";
import type { TeacherDashboardSummary } from "../../shared/api/contracts";

export interface TeacherGateway {
  getSummary(cohortId: string): Promise<TeacherDashboardSummary>;
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
  const response = (
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
};
