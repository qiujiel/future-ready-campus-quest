import {
  dashboardSummaryCsv,
  escapeCsvField,
  teacherPrivateCsv,
} from "../../src/teacher/export/csv";
import type { TeacherDashboardSummary } from "../../src/shared/api/contracts";

it.each([
  ["comma,value", "\"comma,value\""],
  ["quote\"value", "\"quote\"\"value\""],
  ["line\nvalue", "\"line\nvalue\""],
  ["普通话", "普通话"],
  ["", ""],
  ["=2+2", "'=2+2"],
  ["+SUM(A1:A2)", "'+SUM(A1:A2)"],
  ["-10+20", "'-10+20"],
  ["@IMPORTXML(A1)", "'@IMPORTXML(A1)"],
  ["\n=2+2", "\"'\n=2+2\""],
])("serializes %s safely", (value, expected) => {
  expect(escapeCsvField(value)).toBe(expected);
});

it("uses stable summary keys and keeps first, final, and retry separate", () => {
  const summary: TeacherDashboardSummary = {
    cohortId: "cohort-1",
    enrolled: 1,
    active: 0,
    completed: 1,
    conceptAggregates: [
      {
        conceptId: "C1",
        first: { needs_support: 1, developing: 0, secure: 0 },
        final: { needs_support: 0, developing: 0, secure: 1 },
        retryCorrect: 1,
        retryAttempted: 2,
      },
    ],
    mostMissed: [],
    teamScores: [],
    generatedAt: "2030-01-01T09:00:00.000Z",
  };
  const csv = dashboardSummaryCsv(summary);

  expect(csv).toContain(
    "export_timestamp,formula_version,concept_id,first_needs_support,first_developing,first_secure,final_needs_support,final_developing,final_secure,retry_correct,retry_attempted",
  );
  expect(csv).toContain(
    "2030-01-01T09:00:00.000Z,team-score-60-25-10-5-v1,C1,1,0,0,0,0,1,1,2",
  );
});

it("makes Unicode names and formula-like private values inert", () => {
  const csv = teacherPrivateCsv(
    "2030-01-01T09:00:00.000Z",
    [
      {
        realName: "李同学",
        nickname: "=HYPERLINK(\"bad\")",
        groupName: "Future, Makers",
        completed: true,
      },
    ],
  );
  expect(csv).toContain("李同学");
  expect(csv).toContain("\"'=HYPERLINK(\"\"bad\"\")\"");
  expect(csv).toContain("\"Future, Makers\"");
});
