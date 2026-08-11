import { render } from "@testing-library/react";
import { axe } from "jest-axe";
import { MemoryRouter } from "react-router-dom";
import { TeacherShell } from "../../src/features/teacher/TeacherShell";
import type { TeacherDashboardSummary } from "../../src/shared/api/contracts";

const summary: TeacherDashboardSummary = {
  cohortId: "d3000000-0000-4000-8000-000000000001",
  enrolled: 6,
  active: 2,
  completed: 4,
  conceptAggregates: Array.from({ length: 8 }, (_, index) => ({
    conceptId: `C${index + 1}` as `C${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8}`,
    first: { needs_support: 1, developing: 1, secure: 4 },
    final: { needs_support: 0, developing: 1, secure: 5 },
    retryCorrect: index === 0 ? 1 : 0,
    retryAttempted: index === 0 ? 1 : 0,
  })),
  mostMissed: [
    {
      itemId: "item-1",
      conceptId: "C1",
      shortLabel: "C1 final",
      incorrectCount: 2,
      responseCount: 6,
      misconceptionTags: [{ tag: "purpose-missing", count: 2 }],
    },
  ],
  teamScores: [
    {
      groupId: "group-1",
      groupNumber: 1,
      displayName: "Future Makers",
      score: 84,
      completedMembers: 4,
      enrolledMembers: 6,
    },
  ],
  generatedAt: "2030-01-01T09:00:00.000Z",
};

it("has no serious accessibility violations across the teacher dashboard", async () => {
  const view = render(
    <MemoryRouter>
      <TeacherShell
        cohortId={summary.cohortId}
        gateway={{ async getSummary() { return summary; } }}
      />
    </MemoryRouter>,
  );
  await view.findByRole("heading", { name: /current class/i });

  const result = await axe(view.container);
  expect(
    result.violations.filter(
      (violation) =>
        violation.impact === "serious" ||
        violation.impact === "critical",
    ),
  ).toEqual([]);
});
