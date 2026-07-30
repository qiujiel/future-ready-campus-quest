import { getSupabaseClient } from "../../shared/api/supabase";
import type {
  AttemptState,
  CompleteQuestInput,
  LearningItemPayload,
  QuestCompletionResult,
  ReflectionPrompt,
  ResumeLearningResult,
  ResponseResult,
  ResponseSubmission,
} from "../../shared/api/contracts";

export interface LearningGateway {
  getNextItem(attemptId: string): Promise<LearningItemPayload | null>;
  submitResponse(input: ResponseSubmission): Promise<ResponseResult>;
  getReflectionPrompt(attemptId: string): Promise<ReflectionPrompt>;
  completeQuest(input: CompleteQuestInput): Promise<QuestCompletionResult>;
  getAttemptState(attemptId: string): Promise<AttemptState>;
  resumeAttempt(attemptId: string): Promise<ResumeLearningResult>;
}

export class LearningGatewayError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

async function responseError(
  context: unknown,
  fallback: string,
): Promise<never> {
  const response = context as {
    response?: Response;
  } | null;
  if (response?.response) {
    try {
      const body = await response.response.clone().json() as {
        error?: unknown;
      };
      if (typeof body.error === "string") {
        throw new LearningGatewayError(body.error);
      }
    } catch (error) {
      if (error instanceof LearningGatewayError) throw error;
    }
  }
  throw new LearningGatewayError(
    response?.response?.status === 401 ? "AUTH_REQUIRED" : fallback,
  );
}

export const supabaseLearningGateway: LearningGateway = {
  async getNextItem(attemptId) {
    const response = await getSupabaseClient().functions.invoke(
      "get-next-item",
      { body: { attemptId } },
    );
    if (response.error) {
      await responseError(
        response.error.context,
        "LEARNING_ITEM_NOT_AVAILABLE",
      );
    }
    const data = response.data as {
      item: LearningItemPayload | null;
    };
    return data.item;
  },

  async submitResponse(input) {
    const response = await getSupabaseClient().functions.invoke(
      "submit-response",
      { body: input },
    );
    if (response.error) {
      await responseError(response.error.context, "RESPONSE_NOT_ACCEPTED");
    }
    const data = response.data as { result: ResponseResult };
    return data.result;
  },

  async getReflectionPrompt(attemptId) {
    const response = await getSupabaseClient().functions.invoke(
      "complete-quest",
      { body: { action: "prompt", attemptId } },
    );
    if (response.error) {
      await responseError(response.error.context, "QUEST_NOT_READY");
    }
    const data = response.data as { prompt: ReflectionPrompt };
    return data.prompt;
  },

  async completeQuest(input) {
    const response = await getSupabaseClient().functions.invoke(
      "complete-quest",
      { body: { action: "complete", ...input } },
    );
    if (response.error) {
      await responseError(response.error.context, "QUEST_NOT_READY");
    }
    const data = response.data as { result: QuestCompletionResult };
    return data.result;
  },

  async getAttemptState(attemptId) {
    const response = await getSupabaseClient()
      .from("quest_attempts")
      .select(
        "id,status,current_phase,last_accepted_sequence",
      )
      .eq("id", attemptId)
      .single();
    if (response.error || !response.data) {
      throw new LearningGatewayError("ATTEMPT_NOT_AVAILABLE");
    }
    return {
      attemptId: String(response.data.id),
      status: response.data.status as AttemptState["status"],
      currentPhase:
        response.data.current_phase as AttemptState["currentPhase"],
      lastAcceptedSequence: Number(
        response.data.last_accepted_sequence,
      ),
    };
  },

  async resumeAttempt(attemptId) {
    const client = getSupabaseClient();
    const session = await client.auth.getSession();
    if (session.error || !session.data.session) {
      return { status: "recovery-required" };
    }
    const attempt = await this.getAttemptState(attemptId);
    const item = attempt.status === "active"
      ? await this.getNextItem(attemptId)
      : null;
    return { status: "resumed", attempt, item };
  },
};
