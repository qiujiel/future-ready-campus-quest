import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import { App } from "../../src/app/App";
import { JoinPage } from "../../src/features/join/JoinPage";
import type { AuthGateway } from "../../src/shared/api/authGateway";

type StudentEntryGateway = AuthGateway & {
  getCurrentRole(): Promise<"teacher" | "student" | null>;
  signOut(): Promise<void>;
};

function CurrentPath() {
  return <output aria-label="current path">{useLocation().pathname}</output>;
}

function gateway(
  overrides: Partial<StudentEntryGateway> = {},
): StudentEntryGateway {
  return {
    async signInTeacher() {},
    async createCohort() {
      return { cohortId: "cohort-1" };
    },
    async getCurrentRole() {
      return null;
    },
    async signOut() {},
    async joinCohort() {
      return {
        identity: {
          studentId: "student-1",
          cohortId: "cohort-1",
          groupId: "group-1",
          groupNumber: 4,
          nickname: "Explorer 1",
          isGroupIdentityEditor: true,
        },
        accessToken: "access",
        refreshToken: "refresh",
      };
    },
    async loginStudent() {
      return {
        identity: {
          studentId: "student-1",
          cohortId: "cohort-1",
          groupId: "group-1",
          groupNumber: 4,
          nickname: "Explorer 1",
          isGroupIdentityEditor: false,
        },
        accessToken: "access",
        refreshToken: "refresh",
      };
    },
    async recoverStudent() {
      throw new Error("unused");
    },
    ...overrides,
  };
}

function renderEntry(
  entryGateway: StudentEntryGateway,
  initialEntry = "/class/40000000-0000-4000-8000-000000000099",
) {
  const router = createMemoryRouter(
    [
      { path: "/class/:classAccessId", element: <JoinPage gateway={entryGateway} /> },
      { path: "/join", element: <JoinPage gateway={entryGateway} /> },
      { path: "/quest", element: <CurrentPath /> },
    ],
    { initialEntries: [initialEntry] },
  );
  render(<RouterProvider router={router} />);
}

it("links the public Student action to the shared join route", () => {
  render(<App />);

  expect(screen.getByRole("link", { name: /^student$/i })).toHaveAttribute(
    "href",
    "#/join",
  );
});

it("tells students on the generic route to use their teacher's class link", () => {
  renderEntry(gateway(), "/join");

  expect(screen.getByText("Use the class link your teacher shared.")).toBeVisible();
  expect(screen.queryByLabelText(/your name/i)).not.toBeInTheDocument();
});

it("joins from the class route using a name, code, passcode, and leader choice", async () => {
  const joinCohort = vi.fn(gateway().joinCohort);
  renderEntry(gateway({ joinCohort }));

  await screen.findByRole("heading", { name: /join your class/i });
  expect(screen.getByLabelText(/your name/i)).toBeVisible();
  expect(screen.getByLabelText(/group code/i)).toBeVisible();
  expect(screen.queryByLabelText(/email|password/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/nickname|privacy confirmation/i)).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/your name/i), {
    target: { value: "  Synthetic   Learner  " },
  });
  fireEvent.change(screen.getByLabelText(/group code/i), {
    target: { value: " abcd-72qx " },
  });
  fireEvent.change(screen.getByLabelText(/^create a 4-digit passcode$/i), {
    target: { value: "4826" },
  });
  fireEvent.change(screen.getByLabelText(/^confirm passcode$/i), {
    target: { value: "4826" },
  });
  fireEvent.click(screen.getByRole("button", { name: /join group/i }));

  await waitFor(() => expect(joinCohort).toHaveBeenCalledTimes(1));
  expect(joinCohort).toHaveBeenCalledWith({
    classAccessId: "40000000-0000-4000-8000-000000000099",
    displayName: "Synthetic Learner",
    joinCode: "ABCD72QX",
    passcode: "4826",
    wantsLeader: false,
    requestKey: expect.stringMatching(/^[0-9a-f-]{36}$/i),
  });
  expect(await screen.findByLabelText("current path")).toHaveTextContent(
    "/quest",
  );
});

it("offers a returning student a safe continue or new-session choice", async () => {
  const signOut = vi.fn(async () => {});
  renderEntry(
    gateway({
      async getCurrentRole() {
        return "student";
      },
      signOut,
    }),
  );

  expect(
    await screen.findByRole("heading", { name: /continue your activity/i }),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: /continue activity/i })).toHaveAttribute(
    "href",
    "#/quest",
  );

  fireEvent.click(
    screen.getByRole("button", { name: /start a new student session/i }),
  );
  await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
  expect(await screen.findByLabelText(/your name/i)).toBeVisible();
});
