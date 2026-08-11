import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TeacherShell } from "../../src/features/teacher/TeacherShell";
import type {
  ClassroomReadinessReport,
  TeacherDashboardSummary,
  TeacherQuestionBank,
} from "../../src/shared/api/contracts";
import type { TeacherGateway } from "../../src/teacher/api/teacherClient";

const cohortId = "d3000000-0000-4000-8000-000000000001";

const summary = {
  cohortId,
  enrolled: 4,
  active: 2,
  completed: 3,
  conceptAggregates: Array.from({ length: 8 }, (_, index) => ({
    conceptId: `C${index + 1}`,
    first: {
      needs_support: index === 0 ? 3 : 0,
      developing: index === 0 ? 1 : 4,
      secure: 0,
    },
    final: {
      needs_support: index === 0 ? 2 : 0,
      developing: index === 0 ? 2 : 4,
      secure: 0,
    },
    retryCorrect: 0,
    retryAttempted: 0,
  })),
  classFocus: {
    conceptId: "C1",
    missedStudents: 3,
    studentCount: 4,
    missedQuestions: [
      { itemId: "C1-Q3", incorrectResponses: 5, responses: 8 },
    ],
  },
  mostMissed: [],
  teamScores: [
    {
      groupId: "group-1",
      groupNumber: 1,
      displayName: "Future Makers",
      score: 86,
      completedMembers: 3,
      enrolledMembers: 4,
      conceptFocus: {
        conceptId: "C1",
        missedStudents: 3,
        studentCount: 4,
        missedQuestions: [
          { itemId: "C1-Q3", incorrectResponses: 3, responses: 4 },
        ],
      },
    },
  ],
  generatedAt: "2030-01-01T09:00:00.000Z",
} as unknown as TeacherDashboardSummary;

const readiness: ClassroomReadinessReport = {
  cohortId,
  title: "Digital Futures · Class 1",
  expected: 4,
  joined: 4,
  active: 2,
  started: 2,
  submitted: 3,
  incomplete: 1,
  errors: 0,
  joining: {
    open: true,
    expiresAt: "2030-01-01T10:00:00.000Z",
    studentUrl: "https://example.test/#/join/class-1",
  },
  groups: [
    {
      groupId: "group-1",
      groupNumber: 1,
      displayName: "Future Makers",
      capacity: 20,
      joinCode: "MAPLE-7",
      joinEnabled: true,
      students: [
        {
          studentId: "student-1",
          displayName: "Learner One",
          isGroupLeader: true,
          joinedAt: "2030-01-01T08:40:00.000Z",
          lastActiveAt: "2030-01-01T08:59:00.000Z",
          activityStatus: "submitted",
          currentPhase: "reflection",
        },
      ],
    },
  ],
};

const questionBank = {
  versionKey: "classroom-v1",
  itemCount: 24,
  conceptCount: 8,
  items: [
    {
      itemId: "C1-Q3",
      conceptId: "C1",
      form: "final",
      stem: "Which action best protects students when an AI tool is used?",
      interaction: {
        kind: "single-choice",
        options: [
          { id: "A", text: "Upload all student work" },
          { id: "B", text: "Check privacy terms and avoid personal data" },
        ],
      },
      correctResponse: ["B"],
      rationale: "Protect personal information before using an AI tool.",
      sourcePageLabels: ["Teacher guide p. 4"],
    },
    {
      itemId: "C1-Q1",
      conceptId: "C1",
      form: "diagnostic",
      stem: "This C1 question was not missed.",
      interaction: {
        kind: "single-choice",
        options: [
          { id: "A", text: "One" },
          { id: "B", text: "Two" },
        ],
      },
      correctResponse: ["A"],
      rationale: "Not part of the selected review.",
      sourcePageLabels: ["Teacher guide p. 1"],
    },
  ],
} as unknown as TeacherQuestionBank;

function gateway(overrides: Partial<TeacherGateway> = {}): TeacherGateway {
  return {
    async getSummary() {
      return summary;
    },
    async getReadiness() {
      return readiness;
    },
    async getQuestionBank() {
      return questionBank;
    },
    ...overrides,
  };
}

describe("simplified teacher board", () => {
  it("puts class focus, team scores, group codes, and progress access in one simple hierarchy", async () => {
    render(
      <MemoryRouter>
        <TeacherShell cohortId={cohortId} gateway={gateway()} />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", {
        name: "Digital Futures · Class 1",
      }),
    ).toBeVisible();
    const classFocusHeading = screen.getByRole("heading", {
      name: /most-missed concept/i,
    });
    expect(classFocusHeading).toBeVisible();
    expect(within(classFocusHeading.closest("section")!).getByText("C1"))
      .toBeVisible();

    const teamResults = screen.getByRole("heading", { name: "Team results" })
      .closest("section")!;
    const team = within(teamResults).getByRole("row", {
      name: /Future Makers/,
    });
    expect(team).toHaveTextContent(/86/);
    expect(team).toHaveTextContent(/C1/);
    expect(team).toHaveTextContent(/3 of 4/);

    fireEvent.click(
      screen.getByText(/classroom setup and group codes/i),
    );
    const groupTable = screen.getByRole("table", {
      name: "Group codes and students",
    });
    expect(within(groupTable).getByText("MAPLE-7")).toBeVisible();
    expect(
      screen.getByRole("link", { name: /view Learner One progress/i }),
    ).toHaveAttribute(
      "href",
      `#/teacher/cohorts/${cohortId}/students/student-1`,
    );
  });

  it("reviews only the questions actually missed for the selected team", async () => {
    render(
      <MemoryRouter>
        <TeacherShell cohortId={cohortId} gateway={gateway()} />
      </MemoryRouter>,
    );

    const teamResults = (await screen.findByRole("heading", {
      name: "Team results",
    })).closest("section")!;
    const team = within(teamResults).getByRole("row", {
      name: /Future Makers/,
    });
    fireEvent.click(within(team).getByRole("button", { name: /review/i }));

    expect(
      await screen.findByRole("heading", {
        name: "Which action best protects students when an AI tool is used?",
      }),
    ).toBeVisible();
    expect(screen.getByText(/Upload all student work/)).toBeVisible();
    expect(
      screen.getByText(/Check privacy terms and avoid personal data/),
    ).toBeVisible();
    expect(
      screen.getByText((_, element) =>
        element?.tagName === "P" && element.textContent === "Correct answer: B"
      ),
    ).toBeVisible();
    expect(
      screen.getByText(/Protect personal information before using an AI tool/i),
    ).toBeVisible();
    expect(
      screen.queryByText("This C1 question was not missed."),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Teacher guide p\./i)).not.toBeInTheDocument();
  });

  it("keeps the board usable when missed-question details cannot be loaded", async () => {
    const teacherGateway = gateway({
      async getQuestionBank() {
        throw new Error("question bank unavailable");
      },
    });
    render(
      <MemoryRouter>
        <TeacherShell cohortId={cohortId} gateway={teacherGateway} />
      </MemoryRouter>,
    );

    const teamResults = (await screen.findByRole("heading", {
      name: "Team results",
    })).closest("section")!;
    const team = within(teamResults).getByRole("row", {
      name: /Future Makers/,
    });
    fireEvent.click(within(team).getByRole("button", { name: /review/i }));

    expect(
      await screen.findByRole("alert", {
        name: "",
      }),
    ).toHaveTextContent(/missed questions could not be loaded/i);
    expect(screen.getByRole("heading", { name: "Team results" })).toBeVisible();
  });

  it("requires the exact class name before removing the class and returning to setup", async () => {
    const removeClass = vi.fn(async () => {});
    const teacherGateway = gateway({ removeClass } as Partial<TeacherGateway>);
    render(
      <MemoryRouter initialEntries={[`/teacher/cohorts/${cohortId}`]}>
        <Routes>
          <Route
            path="/teacher/cohorts/:cohortId"
            element={<TeacherShell gateway={teacherGateway} />}
          />
          <Route path="/teacher/setup" element={<h1>Class setup</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Remove class" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: /remove Digital Futures · Class 1/i,
    });
    const confirm = within(dialog).getByRole("button", {
      name: /remove class permanently/i,
    });
    expect(confirm).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText(/type.*to confirm/i), {
      target: { value: "Digital Futures · Class 1" },
    });
    fireEvent.click(confirm);

    await waitFor(() => expect(removeClass).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("heading", { name: "Class setup" }))
      .toBeVisible();
  });
});
