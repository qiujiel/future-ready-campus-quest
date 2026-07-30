import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import { JoinPage } from "../src/features/join/JoinPage";
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
    groupCapacity: number;
    requestKey: string;
  }>;
  joinCalls: Array<Parameters<AuthGateway["joinCohort"]>[0]>;
} {
  return {
    signInCalls: [],
    createCalls: [],
    joinCalls: [],
    async signInTeacher(email, password) {
      this.signInCalls.push({ email, password });
    },
    async createCohort(input) {
      this.createCalls.push(input);
      return { cohortId: "40000000-0000-4000-8000-000000000001" };
    },
    async joinCohort(input) {
      this.joinCalls.push(input);
      return {
        identity: {
          studentId: "20000000-0000-4000-8000-000000000001",
          cohortId: "40000000-0000-4000-8000-000000000001",
          groupId: "60000000-0000-4000-8000-000000000001",
          groupNumber: input.groupNumber,
          nickname: input.nickname ?? "Explorer 1",
          isGroupIdentityEditor: true,
        },
        accessToken: "student-access-token",
        refreshToken: "student-refresh-token",
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

it("creates a teacher-owned cohort with five groups of six by default", async () => {
  const gateway = createGateway();
  render(<TeacherSetupPage gateway={gateway} />);

  fireEvent.change(screen.getByLabelText(/cohort title/i), {
    target: { value: "Thursday seminar" },
  });
  fireEvent.click(screen.getByRole("button", { name: /create cohort/i }));

  await waitFor(() => expect(gateway.createCalls).toHaveLength(1));
  expect(gateway.createCalls[0]).toMatchObject({
    title: "Thursday seminar",
    groupCount: 5,
    groupCapacity: 6,
  });
  expect(gateway.createCalls[0]?.requestKey).toMatch(
    /^[0-9a-f-]{36}$/i,
  );
});

it("joins a student without asking for email, password, or PIN", async () => {
  const gateway = createGateway();
  const router = createMemoryRouter(
    [
      {
        path: "/join/:token",
        element: <JoinPage gateway={gateway} />,
      },
      { path: "/quest", element: <CurrentPath /> },
    ],
    { initialEntries: ["/join/shared-class-token-with-sufficient-entropy"] },
  );
  render(<RouterProvider router={router} />);

  expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/password|pin/i)).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/assigned group number/i), {
    target: { value: "3" },
  });
  fireEvent.change(screen.getByLabelText(/^real name/i), {
    target: { value: "Synthetic Learner" },
  });
  fireEvent.change(screen.getByLabelText(/^nickname/i), {
    target: { value: "Silver Fern" },
  });
  fireEvent.click(screen.getByLabelText(/class privacy notice/i));
  fireEvent.click(screen.getByRole("button", { name: /join the campus/i }));

  await waitFor(() => expect(gateway.joinCalls).toHaveLength(1));
  expect(gateway.joinCalls[0]).toMatchObject({
    joinToken: "shared-class-token-with-sufficient-entropy",
    groupNumber: 3,
    realName: "Synthetic Learner",
    nickname: "Silver Fern",
    privacyConfirmed: true,
  });
  expect(await screen.findByLabelText("current path")).toHaveTextContent(
    "/quest",
  );
});
