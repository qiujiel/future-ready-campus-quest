import type {
  TeacherDashboardSummary,
} from "../../shared/api/contracts.ts";

const formulaPrefix = /^[\t\r\n ]*[=+\-@]/;

export function escapeCsvField(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (formulaPrefix.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function serializeCsv(
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
): string {
  return [
    headers.map(escapeCsvField).join(","),
    ...rows.map((row) => row.map(escapeCsvField).join(",")),
  ].join("\r\n");
}

export function dashboardSummaryCsv(
  summary: TeacherDashboardSummary,
): string {
  return serializeCsv(
    [
      "export_timestamp",
      "formula_version",
      "concept_id",
      "first_needs_support",
      "first_developing",
      "first_secure",
      "final_needs_support",
      "final_developing",
      "final_secure",
      "retry_correct",
      "retry_attempted",
    ],
    summary.conceptAggregates.map((concept) => [
      summary.generatedAt,
      "team-score-60-25-10-5-v1",
      concept.conceptId,
      concept.first.needs_support,
      concept.first.developing,
      concept.first.secure,
      concept.final.needs_support,
      concept.final.developing,
      concept.final.secure,
      concept.retryCorrect,
      concept.retryAttempted,
    ]),
  );
}

export interface TeacherPrivateExportRow {
  realName: string;
  nickname: string;
  groupName: string;
  completed: boolean;
}

export function teacherPrivateCsv(
  exportedAt: string,
  rows: readonly TeacherPrivateExportRow[],
): string {
  return serializeCsv(
    [
      "export_timestamp",
      "formula_version",
      "real_name",
      "nickname",
      "group_name",
      "completed",
    ],
    rows.map((row) => [
      exportedAt,
      "team-score-60-25-10-5-v1",
      row.realName,
      row.nickname,
      row.groupName,
      row.completed ? "yes" : "no",
    ]),
  );
}
