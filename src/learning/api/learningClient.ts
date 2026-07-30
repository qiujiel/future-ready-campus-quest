import { getSupabaseClient } from "../../shared/api/supabase";
import type {
  CompleteQuestInput,
  LearningItemPayload,
  QuestCompletionResult,
  ReflectionPrompt,
  ResponseResult,
  ResponseSubmission,
} from "../../shared/api/contracts";

export interface LearningGateway {
  getNextItem(attemptId: string): Promise<LearningItemPayload | null>;
  submitResponse(input: ResponseSubmission): Promise<ResponseResult>;
  getReflectionPrompt(attemptId: string): Promise<ReflectionPrompt>;
  completeQuest(input: CompleteQuestInput): Promise<QuestCompletionResult>;
}

export class LearningGatewayError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

function responseError(context: unknown, fallback: string): never {
  const response = context as {
    response?: Response;
  } | null;
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
      responseError(response.error.context, "LEARNING_ITEM_NOT_AVAILABLE");
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
      responseError(response.error.context, "RESPONSE_NOT_ACCEPTED");
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
      responseError(response.error.context, "QUEST_NOT_READY");
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
      responseError(response.error.context, "QUEST_NOT_READY");
    }
    const data = response.data as { result: QuestCompletionResult };
    return data.result;
  },
};
