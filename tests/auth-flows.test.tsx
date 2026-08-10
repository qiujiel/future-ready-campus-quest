import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import { JoinPage } from "../src/features/join/JoinPage";
import { RecoveryPage } from "../src/features/join/RecoveryPage";
import { TeacherSetupPage } from "../src/features/teacher/TeacherSetupPage";
import { TeacherSignInPage } from "../src/features/teacher/TeacherSignInPage";
import type { AuthGateway } from "../src/shared/api/authGateway";

function CurrentPath() {
  return <output aria-label="current path">{useLocation().pathname}</output>;
}

function createGateway(): AuthGateway & {
  signInCalls: Array<{ email: string; password: string }>;
  createCalls: Array<{
    title: string;
    groupCount: number;
    requestKey: string;
  }>;
  openCalls: Array<{ cohortId: string; requestKey: string }>;
  joinCalls: Array<Parameters<AuthGateway["joinCohort"]>[0]>;
} {
  return {
    signInCalls: [],
    createCalls: [],
    openCalls: [],
    joinCalls: [],
    async signInTeacher(email, password) {
      this.signInCalls.push({ email, password });
    },
    async createCohort(input) {
      this.createCalls.push(input);
      return { cohortId: "40000000-0000-4000-8000-000000000001" };
    },
    async openJoinWindow(cohortId, requestKey) {
      this.openCalls.push({ cohortId, requestKey });
      return {
        joinUrl: "https://example.invalid/#/class/40000000-0000-4000-8000-000000000099",
        studentUrl: "https://example.invalid/#/class/40000000-0000-4000-8000-000000000099",
        expiresAt: "2026-08-10T12:15:00.000Z",
        groups: [],
      };
    },
    async joinCohort(input) {
      this.joinCalls.push(input);
      return {
        identity: {
          studentId: "20000000-0000-4000-8000-000000000001",
          cohortId: "40000000-0000-4000-8000-000000000001",
          groupId: "60000000-0000-4000-8000-000000000001",
          groupNumber: 3,
          nickname: "Explorer 1",
          isGroupIdentityEditor: true,
        },
        accessToken: "student-access-token",
        refreshToken: "student-refresh-token",
      };
    },
    async loginStudent(input) {
      return {
        identity: {
          studentId: "20000000-0000-4000-8000-000000000001",
          cohortId: "40000000-0000-4000-8000-000000000001",
          groupId: "60000000-0000-4000-8000-000000000001",
          groupNumber: 3,
          nickname: input.displayName,
          isGroupIdentityEditor: true,
        },
        accessToken: "student-access-token",
        refreshToken: "student-refresh-token",
      };
    },
    async recoverStudent() {
      return {
        studentId: "20000000-0000-4000-8000-000000000001",
        accessToken: "replacement-access-token",
        refreshToken: "replacement-refresh-token",
      };
    },
  };
}

it("signs a teacher in and continues to cohort setup", async () => {
  const gateway = createGateway();
  const router = createMemoryRouter(
    [
      {
        path: "/teacher/sign-in",
        element: <TeacherSignInPage gateway={gateway} />,
      },
      { path: "/teacher/setup", element: <CurrentPath /> },
    ],
    { initialEntries: ["/teacher/sign-in"] },
  );
  render(<RouterProvider router={router} />);

  fireEvent.change(screen.getByLabelText(/email address/i), {
    target: { value: "teacher@example.invalid" },
  });
  fireEvent.change(screen.getByLabelText(/password/i), {
    target: { value: "strong-passphrase" },
  });
  fireEvent.click(screen.getByRole("button", { name: /sign in securely/i }));

  await expect.poll(() => gateway.signInCalls).toEqual([
    {
      email: "teacher@example.invalid",
      password: "strong-passphrase",
    },
  ]);
  expect(await screen.findByLabelText("current path")).toHaveTextContent(
    "/teacher/setup",
  );
});

it("creates and opens a class using only its name and number of groups", async () => {
  const gateway = createGateway();
  const router = createMemoryRouter(
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
  render(<RouterProvider router={router} />);

  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  expect(screen.getAllByRole("spinbutton")).toHaveLength(1);
  expect(screen.queryByLabelText(/students per group/i)).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/class name/i), {
    target: { value: "Thursday seminar" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: /create class and open joining/i }),
  );

  await waitFor(() => expect(gateway.createCalls).toHaveLength(1));
  expect(gateway.createCalls[0]).toMatchObject({
    title: "Thursday seminar",
    groupCount: 5,
  });
  expect(gateway.createCalls[0]?.requestKey).toMatch(
    /^[0-9a-f-]{36}$/i,
  );
  expect(gateway.openCalls).toHaveLength(1);
  expect(gateway.openCalls[0]).toMatchObject({
    cohortId: "40000000-0000-4000-8000-000000000001",
  });
  expect(gateway.openCalls[0]?.requestKey).toMatch(/^[0-9a-f-]{36}$/i);
});

it("joins a student from the class route without email or password", async () => {
  const gateway = createGateway();
  const router = createMemoryRouter(
    [
      {
        path: "/class/:classAccessId",
        element: <JoinPage gateway={gateway} />,
      },
      { path: "/quest", element: <CurrentPath /> },
    ],
    { initialEntries: ["/class/40000000-0000-4000-8000-000000000099"] },
  );
  render(<RouterProvider router={router} />);

  expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();

  fireEvent.change(await screen.findByLabelText(/your name/i), {
    target: { value: "Synthetic Learner" },
  });
  fireEvent.change(screen.getByLabelText(/group code/i), {
    target: { value: "CAMPUS73" },
  });
  fireEvent.change(screen.getByLabelText(/^create a 4-digit passcode$/i), {
    target: { value: "4826" },
  });
  fireEvent.change(screen.getByLabelText(/^confirm passcode$/i), {
    target: { value: "4826" },
  });
  fireEvent.click(screen.getByRole("button", { name: /join group/i }));

  await waitFor(() => expect(gateway.joinCalls).toHaveLength(1));
  expect(gateway.joinCalls[0]).toMatchObject({
    classAccessId: "40000000-0000-4000-8000-000000000099",
    joinCode: "CAMPUS73",
    displayName: "Synthetic Learner",
    passcode: "4826",
    wantsLeader: false,
  });
  expect(await screen.findByLabelText("current path")).toHaveTextContent(
    "/quest",
  );
});

it("redeems a teacher-issued recovery link and removes it from the route", async () => {
  const gateway = {
    ...createGateway(),
    recoveryCalls: [] as Array<{
      recoveryToken: string;
      requestKey: string;
    }>,
    async recoverStudent(input: {
      recoveryToken: string;
      requestKey: string;
    }) {
      this.recoveryCalls.push(input);
      return {
        studentId: "20000000-0000-4000-8000-000000000001",
        accessToken: "replacement-access-token",
        refreshToken: "replacement-refresh-token",
      };
    },
  };
  const router = createMemoryRouter(
    [
      {
        path: "/recover/:token",
        element: <RecoveryPage gateway={gateway} />,
      },
      { path: "/quest", element: <CurrentPath /> },
    ],
    { initialEntries: ["/recover/single-use-recovery-token-with-enough-entropy"] },
  );
  render(<RouterProvider router={router} />);

  fireEvent.click(screen.getByRole("button", { name: /restore my session/i }));

  await waitFor(() => expect(gateway.recoveryCalls).toHaveLength(1));
  expect(gateway.recoveryCalls[0]).toMatchObject({
    recoveryToken: "single-use-recovery-token-with-enough-entropy",
  });
  expect(await screen.findByLabelText("current path")).toHaveTextContent(
    "/quest",
  );
});
