import { getSupabaseClient } from "../../shared/api/supabase";
import type { TeacherControlGateway } from "../../features/teacher/SessionControls";

export const supabaseTeacherControlGateway: TeacherControlGateway = {
  async execute(command) {
    const result = await getSupabaseClient().functions.invoke(
      "teacher-controls",
      {
        body: {
          ...command,
          requestKey: crypto.randomUUID(),
        },
      },
    );
    if (result.error) throw new Error("CONTROL_NOT_AVAILABLE");
    return result.data;
  },
};
