const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface TeacherClassAccessClient {
  from(table: string): unknown;
}

interface TeacherClassAccessQuery {
  select(columns: string): {
    eq(column: string, value: string): {
      maybeSingle(): PromiseLike<unknown>;
    };
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function loadTeacherStudentAccessId(
  client: TeacherClassAccessClient,
  cohortId: string,
): Promise<string> {
  const query = client.from("cohorts") as TeacherClassAccessQuery;
  const result = await query
    .select("student_access_id")
    .eq("id", cohortId)
    .maybeSingle();
  const data = isRecord(result) && isRecord(result.data) ? result.data : null;
  const value = data?.student_access_id;
  if (
    !isRecord(result) ||
    result.error ||
    typeof value !== "string" ||
    !UUID_PATTERN.test(value)
  ) {
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
