const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface TeacherClassAccessClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): Promise<{
          data: { student_access_id?: unknown } | null;
          error: unknown;
        }>;
      };
    };
  };
}

export async function loadTeacherStudentAccessId(
  client: TeacherClassAccessClient,
  cohortId: string,
): Promise<string> {
  const result = await client
    .from("cohorts")
    .select("student_access_id")
    .eq("id", cohortId)
    .maybeSingle();
  const value = result.data?.student_access_id;
  if (result.error || typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error("CLASS_ACCESS_NOT_AVAILABLE");
  }
  return value.toLowerCase();
}

export function buildStudentClassUrl(
  frontendUrl: string,
  studentAccessId: string,
): string {
  if (!UUID_PATTERN.test(studentAccessId)) {
    throw new Error("CLASS_ACCESS_NOT_AVAILABLE");
  }
  return `${frontendUrl.replace(/\/$/, "")}/#/class/${studentAccessId.toLowerCase()}`;
}
