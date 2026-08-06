import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import { TeacherSetupPage } from "../../src/features/teacher/TeacherSetupPage";
import { TeacherShell } from "../../src/features/teacher/TeacherShell";
import type { AuthGateway } from "../../src/shared/api/authGateway";
import type {
  ConceptId,
  TeacherDashboardSummary,
} from "../../src/shared/api/contracts";
import type { TeacherGateway } from "../../src/teacher/api/teacherClient";

function CurrentPath() {
  return <output aria-label="current path">{useLocation().pathname}</output>;
}

const cohortId = "40000000-0000-4000-8000-000000000001";

function authGateway(): AuthGateway & {
  listCohorts(): Promise<Array<{
    cohortId: string;
    title: string;
    groupCount: number;
    groupCapacity: number;
    createdAt: string;
  }>>;
} {
  return {
    async signInTeacher() {},
    async listCohorts() {
      return [
        {
          cohortId,
          title: "Thursday seminar",
          groupCount: 2,
          groupCapacity: 3,
          createdAt: "2026-08-06T01:00:00.000Z",
        },
      ];
    },
    async createCohort() {
      return { cohortId };
    },
    async openJoinWindow() {
      return {
        joinUrl: "https://example.invalid/future-ready-campus-quest/#/join",
        studentUrl: "https://example.invalid/future-ready-campus-quest/#/join",
        expiresAt: "2026-08-06T01:15:00.000Z",
        groups: [
          {
            groupId: "60000000-0000-4000-8000-000000000001",
            groupNumber: 1,
            joinCode: "HSNY46S4",
            enabled: true,
          },
          {
            groupId: "60000000-0000-4000-8000-000000000002",
            groupNumber: 2,
            joinCode: "KZDLXW4Q",
            enabled: true,
          },
        ],
      };
    },
    async closeJoinWindow() {},
    async joinCohort() {
      throw new Error("unused");
    },
    async recoverStudent() {
      throw new Error("unused");
    },
  };
}

function setupRouter(gateway: AuthGateway) {
  return createMemoryRouter(
    [
      {
        path: "/teacher/setup",
        element: <TeacherSetupPage gateway={gateway} />,
      },
      {
        path: "/teacher/cohorts/:cohortId",
        element: <CurrentPath />,
      },
    ],
    { initialEntries: ["/teacher/setup"] },
  );
}

it("lists existing cohorts and opens their dashboards", async () => {
  render(<RouterProvider router={setupRouter(authGateway())} />);

  expect(await screen.findByText("Thursday seminar")).toBeVisible();
  const open = screen.getByRole("link", {
    name: /open thursday seminar dashboard/i,
  });
  expect(open).toHaveAttribute("href", `#/teacher/cohorts/${cohortId}`);
});

it("takes the teacher directly to a newly created cohort dashboard", async () => {
  render(<RouterProvider router={setupRouter(authGateway())} />);

  fireEvent.change(await screen.findByLabelText(/cohort title/i), {
    target: { value: "Friday seminar" },
  });
  fireEvent.click(screen.getByRole("button", { name: /create cohort/i }));

  expect(await screen.findByLabelText("current path")).toHaveTextContent(
    `/teacher/cohorts/${cohortId}`,
  );
});

it("shows the shared student URL and one code for every group", async () => {
  const gateway = authGateway();
  render(<RouterProvider router={setupRouter(gateway)} />);

  fireEvent.change(await screen.findByLabelText(/cohort title/i), {
    target: { value: "Friday seminar" },
  });
  fireEvent.click(screen.getByRole("button", { name: /create cohort/i }));

  // Exercise setup controls directly because the production page navigates
  // after creation; a supplied navigation callback keeps this focused on the receipt.
  const view = render(
    <RouterProvider
      router={createMemoryRouter(
        [{ path: "/teacher/setup", element: <TeacherSetupPage gateway={gateway} stayAfterCreate /> }],
        { initialEntries: ["/teacher/setup"] },
      )}
    />,
  );
  fireEvent.change(await screen.findByLabelText(/cohort title/i), {
    target: { value: "Friday seminar" },
  });
  fireEvent.click(screen.getByRole("button", { name: /create cohort/i }));
  fireEvent.click(await screen.findByRole("button", { name: /open joining/i }));

  expect(await screen.findByText("HSNY46S4")).toBeVisible();
  expect(screen.getByText("KZDLXW4Q")).toBeVisible();
  expect(
    screen.getByRole("link", { name: /student application/i }),
  ).toHaveAttribute(
    "href",
    "https://example.invalid/future-ready-campus-quest/#/join",
  );
  view.unmount();
});

const conceptAggregates = Array.from({ length: 8 }, (_, index) => ({
  conceptId: `C${index + 1}` as ConceptId,
  first: { needs_support: 0, developing: 0, secure: 0 },
  final: { needs_support: 0, developing: 0, secure: 0 },
  retryCorrect: 0,
  retryAttempted: 0,
}));

const summary: TeacherDashboardSummary = {
  cohortId,
  enrolled: 2,
  active: 1,
  completed: 1,
  conceptAggregates,
  mostMissed: [],
  teamScores: [],
  generatedAt: "2026-08-06T01:05:00.000Z",
};

it("shows group assignments and student readiness details", async () => {
  const gateway = {
    async getSummary() {
      return summary;
    },
    async getReadiness() {
      return {
        cohortId,
        title: "Thursday seminar",
        expected: 6,
        joined: 2,
        active: 1,
        started: 1,
        submitted: 1,
        incomplete: 1,
        errors: 0,
        joining: {
          open: true,
          expiresAt: "2026-08-06T01:15:00.000Z",
          studentUrl: "https://example.invalid/future-ready-campus-quest/#/join",
        },
        groups: [
          {
            groupId: "60000000-0000-4000-8000-000000000001",
            groupNumber: 1,
            displayName: "Group 1",
            capacity: 3,
            joinCode: "HSNY46S4",
            joinEnabled: true,
            students: [
              {
                studentId: "20000000-0000-4000-8000-000000000001",
                displayName: "Synthetic Learner One",
                joinedAt: "2026-08-06T01:01:00.000Z",
                lastActiveAt: "2026-08-06T01:04:00.000Z",
                activityStatus: "submitted" as const,
                currentPhase: "reflection" as const,
              },
              {
                studentId: "20000000-0000-4000-8000-000000000002",
                displayName: "Synthetic Learner Two",
                joinedAt: "2026-08-06T01:02:00.000Z",
                lastActiveAt: null,
                activityStatus: "joined" as const,
                currentPhase: null,
              },
            ],
          },
        ],
      };
    },
  } as TeacherGateway & {
    getReadiness(): Promise<unknown>;
  };

  render(<TeacherShell cohortId={cohortId} gateway={gateway} />);

  expect(
    await screen.findByRole("heading", { name: /classroom readiness/i }),
  ).toBeVisible();
  expect(screen.getByText("Synthetic Learner One")).toBeVisible();
  expect(screen.getByText("Synthetic Learner Two")).toBeVisible();
  expect(screen.getByText(/2 of 6 students joined/i)).toBeVisible();
  expect(screen.getAllByText(/submitted/i)).toHaveLength(2);
  expect(screen.getByText(/not started/i)).toBeVisible();
  await waitFor(() => expect(screen.getAllByText("HSNY46S4")).toHaveLength(2));
});
