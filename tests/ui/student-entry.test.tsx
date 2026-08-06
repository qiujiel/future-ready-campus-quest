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
    async recoverStudent() {
      throw new Error("unused");
    },
    ...overrides,
  };
}

function renderEntry(entryGateway: StudentEntryGateway) {
  const router = createMemoryRouter(
    [
      { path: "/join", element: <JoinPage gateway={entryGateway} /> },
      { path: "/quest", element: <CurrentPath /> },
    ],
    { initialEntries: ["/join"] },
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

it("joins from the shared route using only a name and group code", async () => {
  const joinCohort = vi.fn(gateway().joinCohort);
  renderEntry(gateway({ joinCohort }));

  await screen.findByRole("heading", { name: /join your group/i });
  expect(screen.getByLabelText(/your name/i)).toBeVisible();
  expect(screen.getByLabelText(/group code/i)).toBeVisible();
  expect(screen.queryByLabelText(/email|password|pin/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/nickname|privacy confirmation/i)).not.toBeInTheDocument();

  fireEvent.change(screen.getByLabelText(/your name/i), {
    target: { value: "  Synthetic   Learner  " },
  });
  fireEvent.change(screen.getByLabelText(/group code/i), {
    target: { value: " abcd-72qx " },
  });
  fireEvent.click(screen.getByRole("button", { name: /join group/i }));

  await waitFor(() => expect(joinCohort).toHaveBeenCalledTimes(1));
  expect(joinCohort).toHaveBeenCalledWith({
    displayName: "Synthetic Learner",
    joinCode: "ABCD72QX",
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

