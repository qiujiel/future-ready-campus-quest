import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type {
  ConceptAggregate,
  TeacherDashboardSummary,
} from "../../src/shared/api/contracts";
import type { TeacherGateway } from "../../src/teacher/api/teacherClient";
import { CohortOverview } from "../../src/features/teacher/CohortOverview";
import { ConceptHeatmap } from "../../src/features/teacher/ConceptHeatmap";
import { GroupDrilldown } from "../../src/features/teacher/GroupDrilldown";
import { MostMissedItems } from "../../src/features/teacher/MostMissedItems";
import { StudentDrilldown } from "../../src/features/teacher/StudentDrilldown";
import { TeacherShell } from "../../src/features/teacher/TeacherShell";

const concepts: ConceptAggregate[] = Array.from(
  { length: 8 },
  (_, index) => ({
    conceptId: `C${index + 1}` as ConceptAggregate["conceptId"],
    first: {
      needs_support: index === 0 ? 4 : 0,
      developing: 1,
      secure: index === 0 ? 1 : 5,
    },
    final: {
      needs_support: index === 0 ? 1 : 0,
      developing: 1,
      secure: index === 0 ? 4 : 5,
    },
    retryCorrect: index === 0 ? 2 : 0,
    retryAttempted: index === 0 ? 3 : 0,
  }),
);

const summary: TeacherDashboardSummary = {
  cohortId: "d3000000-0000-4000-8000-000000000001",
  enrolled: 6,
  active: 2,
  completed: 4,
  conceptAggregates: concepts,
  mostMissed: [
    {
      itemId: "item-c1",
      conceptId: "C1",
      shortLabel: "C1 final",
      incorrectCount: 5,
      responseCount: 6,
      misconceptionTags: [
        { tag: "purpose-missing", count: 4 },
        { tag: "tool-first", count: 1 },
      ],
    },
  ],
  teamScores: [
    {
      groupId: "group-1",
      groupNumber: 1,
      displayName: "Future Makers",
      score: 88,
      completedMembers: 4,
      enrolledMembers: 6,
    },
  ],
  generatedAt: "2030-01-01T09:00:00.000Z",
};

describe("teacher dashboard", () => {
  it("moves from a private loading state to an actionable summary", async () => {
    let resolveSummary:
      | ((value: TeacherDashboardSummary) => void)
      | undefined;
    const gateway: TeacherGateway = {
      getSummary: () =>
        new Promise((resolve) => {
          resolveSummary = resolve;
        }),
    };
    render(
      <MemoryRouter>
        <TeacherShell cohortId={summary.cohortId} gateway={gateway} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /loading private cohort evidence/i,
    );
    resolveSummary?.(summary);
    expect(
      await screen.findByRole("heading", { name: /class learning dashboard/i }),
    ).toBeVisible();
    expect(screen.getByText(/learning evidence is arriving/i)).toBeVisible();
  });

  it("distinguishes empty, active, and completed cohort states", () => {
    const { rerender } = render(
      <CohortOverview enrolled={0} active={0} completed={0} />,
    );
    expect(screen.getByText(/no students have joined/i)).toBeVisible();

    rerender(<CohortOverview enrolled={12} active={7} completed={0} />);
    expect(screen.getByText(/learning evidence is arriving/i)).toBeVisible();

    rerender(<CohortOverview enrolled={12} active={0} completed={12} />);
    expect(screen.getByText(/completed the quest/i)).toBeVisible();
  });

  it("keeps first, final, and retry evidence distinct and actionable", () => {
    const select = vi.fn();
    render(<ConceptHeatmap concepts={concepts} onSelect={select} />);

    const c1 = screen.getByRole("row", { name: /C1/i });
    expect(within(c1).getByRole("button", { name: /first.*17% secure/i }))
      .toBeVisible();
    expect(within(c1).getByRole("button", { name: /final.*67% secure/i }))
      .toBeVisible();
    expect(within(c1).getByText(/retry 2 of 3 correct/i)).toBeVisible();

    fireEvent.click(
      within(c1).getByRole("button", { name: /final.*67% secure/i }),
    );
    expect(select).toHaveBeenCalledWith("C1", "final");
  });

  it("connects missed items, misconceptions, groups, and private students", async () => {
    render(
      <MemoryRouter>
        <MostMissedItems items={summary.mostMissed} />
        <GroupDrilldown
          cohortId={summary.cohortId}
          teams={summary.teamScores}
        />
        <StudentDrilldown
          student={{
            studentId: "student-1",
            realName: "Synthetic Learner",
            nickname: "Bright Comet",
            groupName: "Future Makers",
            concepts: [
              {
                conceptId: "C1",
                first: "needs_support",
                final: "secure",
                retry: "2 of 3 correct",
              },
            ],
            outcomes: [
              {
                itemLabel: "C1 final",
                correct: false,
                misconceptionTag: "purpose-missing",
              },
            ],
            reflection: "Apply it during our next planning task.",
          }}
        />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /review C1 final patterns/i }),
    );
    expect(await screen.findByText(/purpose-missing.*4/i)).toBeVisible();
    expect(
      screen.getByRole("link", { name: /view Future Makers/i }),
    ).toHaveAttribute(
      "href",
      `#/teacher/cohorts/${summary.cohortId}/groups/group-1`,
    );
    expect(
      screen.getByRole("heading", {
        name: /private student evidence.*Synthetic Learner/i,
      }),
    ).toBeVisible();
    expect(screen.getByText(/first: needs support/i)).toBeVisible();
    expect(screen.getByText(/final: secure/i)).toBeVisible();
    expect(screen.getByText(/retry: 2 of 3 correct/i)).toBeVisible();
    await waitFor(() =>
      expect(screen.getByText(/private reflection/i)).toBeVisible(),
    );
  });
});
