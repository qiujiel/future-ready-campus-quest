import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import { TeacherSetupPage } from "../../src/features/teacher/TeacherSetupPage";
import { ClassroomReadiness } from "../../src/features/teacher/ClassroomReadiness";
import type { TeacherControlGateway } from "../../src/features/teacher/SessionControls";
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
        joinUrl: "https://example.invalid/future-ready-campus-quest/#/class/40000000-0000-4000-8000-000000000099",
        studentUrl: "https://example.invalid/future-ready-campus-quest/#/class/40000000-0000-4000-8000-000000000099",
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
    async loginStudent() {
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

it("creates and opens a class from a two-field setup", async () => {
  const gateway = authGateway();
  const createCohort = vi.spyOn(gateway, "createCohort");
  const openJoinWindow = vi.spyOn(gateway, "openJoinWindow");
  render(<RouterProvider router={setupRouter(gateway)} />);

  expect(await screen.findByLabelText(/class name/i)).toBeVisible();
  expect(screen.getByLabelText(/number of groups/i)).toBeVisible();
  expect(screen.queryByLabelText(/students per group/i)).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/class name/i), {
    target: { value: "Friday seminar" },
  });
  fireEvent.change(screen.getByLabelText(/number of groups/i), {
    target: { value: "4" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: /create class and open joining/i }),
  );

  await waitFor(() => expect(createCohort).toHaveBeenCalledWith({
    title: "Friday seminar",
    groupCount: 4,
    requestKey: expect.stringMatching(/^[0-9a-f-]{36}$/i),
  }));
  expect(openJoinWindow).toHaveBeenCalledWith(
    cohortId,
    expect.stringMatching(/^[0-9a-f-]{36}$/i),
  );

  expect(await screen.findByLabelText("current path")).toHaveTextContent(
    `/teacher/cohorts/${cohortId}`,
  );
});

it("keeps a created class and navigates to its closed dashboard when opening fails", async () => {
  const gateway = authGateway();
  const createCohort = vi.spyOn(gateway, "createCohort");
  const openJoinWindow = vi
    .spyOn(gateway, "openJoinWindow")
    .mockRejectedValue(new Error("open failed"));
  render(<RouterProvider router={setupRouter(gateway)} />);

  fireEvent.change(await screen.findByLabelText(/class name/i), {
    target: { value: "Friday seminar" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: /create class and open joining/i }),
  );

  expect(await screen.findByLabelText("current path")).toHaveTextContent(
    `/teacher/cohorts/${cohortId}`,
  );
  expect(createCohort).toHaveBeenCalledTimes(1);
  expect(openJoinWindow).toHaveBeenCalledTimes(2);
  expect(openJoinWindow.mock.calls[0]?.[1]).toBe(
    openJoinWindow.mock.calls[1]?.[1],
  );
});

it("reuses the create request key after an ambiguous failure", async () => {
  const gateway = authGateway();
  const createCohort = vi
    .spyOn(gateway, "createCohort")
    .mockRejectedValueOnce(new Error("response lost"))
    .mockResolvedValueOnce({ cohortId });
  render(<RouterProvider router={setupRouter(gateway)} />);

  fireEvent.change(await screen.findByLabelText(/class name/i), {
    target: { value: "Friday seminar" },
  });
  const submit = screen.getByRole("button", {
    name: /create class and open joining/i,
  });
  fireEvent.click(submit);
  await screen.findByText(/class could not be created/i);
  fireEvent.click(submit);

  expect(await screen.findByLabelText("current path")).toHaveTextContent(
    `/teacher/cohorts/${cohortId}`,
  );
  expect(createCohort).toHaveBeenCalledTimes(2);
  expect(createCohort.mock.calls[0]?.[0].requestKey).toBe(
    createCohort.mock.calls[1]?.[0].requestKey,
  );
});

it("retries an ambiguous open once with the same request key", async () => {
  const gateway = authGateway();
  const openJoinWindow = vi
    .spyOn(gateway, "openJoinWindow")
    .mockRejectedValueOnce(new Error("response lost"))
    .mockResolvedValueOnce({
      joinUrl: "https://example.invalid/#/class/40000000-0000-4000-8000-000000000099",
      studentUrl: "https://example.invalid/#/class/40000000-0000-4000-8000-000000000099",
      expiresAt: "2026-08-10T12:15:00.000Z",
      groups: [],
    });
  render(<RouterProvider router={setupRouter(gateway)} />);

  fireEvent.change(await screen.findByLabelText(/class name/i), {
    target: { value: "Friday seminar" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: /create class and open joining/i }),
  );

  expect(await screen.findByLabelText("current path")).toHaveTextContent(
    `/teacher/cohorts/${cohortId}`,
  );
  expect(openJoinWindow).toHaveBeenCalledTimes(2);
  expect(openJoinWindow.mock.calls[0]?.[1]).toBe(
    openJoinWindow.mock.calls[1]?.[1],
  );
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

const readiness = {
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
    studentUrl: "https://example.invalid/future-ready-campus-quest/#/class/40000000-0000-4000-8000-000000000099",
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
          isGroupLeader: true,
          joinedAt: "2026-08-06T01:01:00.000Z",
          lastActiveAt: null,
          activityStatus: "joined" as const,
          currentPhase: null,
        },
        {
          studentId: "20000000-0000-4000-8000-000000000002",
          displayName: "Synthetic Learner Two",
          isGroupLeader: false,
          joinedAt: "2026-08-06T01:02:00.000Z",
          lastActiveAt: "2026-08-06T01:04:00.000Z",
          activityStatus: "incomplete" as const,
          currentPhase: "diagnostic" as const,
        },
      ],
    },
    {
      groupId: "60000000-0000-4000-8000-000000000002",
      groupNumber: 2,
      displayName: "Group 2",
      capacity: 3,
      joinCode: "KZDLXW4Q",
      joinEnabled: true,
      students: [],
    },
  ],
};

it("shows group assignments and student readiness details", async () => {
  const gateway = {
    async getSummary() {
      return summary;
    },
    async getReadiness() {
      return readiness;
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
  expect(screen.getAllByText(/incomplete/i)).toHaveLength(2);
  expect(screen.getByText(/not started/i)).toBeVisible();
  await waitFor(() => expect(screen.getAllByText("HSNY46S4")).toHaveLength(2));
});

it("confirms disabling one group code through the audited control boundary", async () => {
  const execute = vi.fn(async () => ({ affected: 1, actionState: "applied" }));
  const gateway: TeacherControlGateway = { execute };
  const changed = vi.fn();
  render(
    <ClassroomReadiness
      report={readiness}
      controlGateway={gateway}
      onChanged={changed}
    />,
  );

  fireEvent.click(
    screen.getByRole("button", { name: /disable joining for group 1/i }),
  );
  expect(execute).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: /^confirm disable group joining$/i }),
  );

  await waitFor(() =>
    expect(execute).toHaveBeenCalledWith({
      action: "set-group-join",
      cohortId,
      groupId: "60000000-0000-4000-8000-000000000001",
      enabled: false,
    }),
  );
  expect(changed).toHaveBeenCalled();
});

it("offers confirmed move, remove, reset, and recovery controls", async () => {
  const execute = vi.fn(async (command) =>
    command.action === "issue-recovery"
      ? {
          affected: 1,
          recoveryUrl: "https://example.invalid/#/recover/opaque-token",
        }
      : { affected: 1, actionState: "applied" },
  );
  render(
    <ClassroomReadiness report={readiness} controlGateway={{ execute }} />,
  );

  fireEvent.change(
    screen.getByLabelText(/move synthetic learner one to/i),
    { target: { value: "60000000-0000-4000-8000-000000000002" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: /^move synthetic learner one$/i }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: /^confirm move student$/i }),
  );
  await waitFor(() =>
    expect(execute).toHaveBeenCalledWith({
      action: "move-student",
      cohortId,
      studentId: "20000000-0000-4000-8000-000000000001",
      groupId: "60000000-0000-4000-8000-000000000002",
    }),
  );

  fireEvent.click(
    screen.getByRole("button", { name: /reset synthetic learner two/i }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: /^confirm reset student activity$/i }),
  );
  await waitFor(() =>
    expect(execute).toHaveBeenCalledWith({
      action: "reset-student",
      cohortId,
      studentId: "20000000-0000-4000-8000-000000000002",
    }),
  );

  fireEvent.click(
    screen.getByRole("button", { name: /issue recovery for synthetic learner two/i }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: /^confirm issue recovery$/i }),
  );
  expect(
    await screen.findByRole("link", { name: /student recovery link/i }),
  ).toHaveAttribute(
    "href",
    "https://example.invalid/#/recover/opaque-token",
  );

  fireEvent.click(
    screen.getByRole("button", { name: /^remove synthetic learner one$/i }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: /^confirm remove student$/i }),
  );
  await waitFor(() =>
    expect(execute).toHaveBeenCalledWith({
      action: "remove-student",
      cohortId,
      studentId: "20000000-0000-4000-8000-000000000001",
    }),
  );
});
