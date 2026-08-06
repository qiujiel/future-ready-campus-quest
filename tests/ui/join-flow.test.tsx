import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
} from "react-router-dom";
import { JoinPage } from "../../src/features/join/JoinPage";
import type { AuthGateway } from "../../src/shared/api/authGateway";

function CurrentPath() {
  return <output aria-label="current path">{useLocation().pathname}</output>;
}

function joinGateway(
  joinCohort: AuthGateway["joinCohort"],
): AuthGateway {
  return {
    async signInTeacher() {},
    async createCohort() {
      return { cohortId: "cohort-1" };
    },
    joinCohort,
    async recoverStudent() {
      throw new Error("unused");
    },
  };
}

function renderJoin(gateway: AuthGateway) {
  const router = createMemoryRouter(
    [
      { path: "/join", element: <JoinPage gateway={gateway} /> },
      { path: "/quest", element: <CurrentPath /> },
    ],
    { initialEntries: ["/join"] },
  );
  render(<RouterProvider router={router} />);
}

function completeJoinForm() {
  fireEvent.change(screen.getByLabelText(/your name/i), {
    target: { value: "Synthetic Learner" },
  });
  fireEvent.change(screen.getByLabelText(/group code/i), {
    target: { value: "CAMPUS42" },
  });
}

describe("student join flow", () => {
  it("presents the approved name-and-code journey and privacy boundary", () => {
    renderJoin(
      joinGateway(async () => ({
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
      })),
    );

    expect(
      screen.getByRole("heading", { name: /tell your teacher who you are/i }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: /enter your group code/i }),
    ).toBeVisible();
    expect(screen.getByText(/classmates see only a neutral explorer name/i)).toBeVisible();
    expect(screen.getByText(/name is visible only to your teacher/i)).toBeVisible();
    expect(screen.queryByLabelText(/email|password|pin/i)).not.toBeInTheDocument();
  });

  it.each([
    ["JOIN_WINDOW_CLOSED", /joining is closed right now/i],
    ["INACTIVE_COHORT", /joining is closed right now/i],
    ["INVALID_JOIN_CODE", /group code was not recognized/i],
    ["INVALID_GROUP", /group code was not recognized/i],
    ["GROUP_JOIN_CLOSED", /joining is closed for this group/i],
    ["GROUP_FULL", /this group is full/i],
  ])("explains the recoverable %s state", async (code, message) => {
    renderJoin(
      joinGateway(async () => {
        throw new Error(code);
      }),
    );
    completeJoinForm();
    fireEvent.click(screen.getByRole("button", { name: /join group/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("requires both fields and blocks duplicate submission while joining", async () => {
    let resolveJoin:
      | ((value: Awaited<ReturnType<AuthGateway["joinCohort"]>>) => void)
      | undefined;
    const promise = new Promise<Awaited<ReturnType<AuthGateway["joinCohort"]>>>(
      (resolve) => {
        resolveJoin = resolve;
      },
    );
    const joinCohort = vi.fn(() => promise);
    renderJoin(joinGateway(joinCohort));

    fireEvent.click(screen.getByRole("button", { name: /join group/i }));
    expect(joinCohort).not.toHaveBeenCalled();

    completeJoinForm();
    fireEvent.click(screen.getByRole("button", { name: /join group/i }));

    await waitFor(() => expect(joinCohort).toHaveBeenCalledTimes(1));
    const button = screen.getByRole("button", { name: /joining/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(joinCohort).toHaveBeenCalledTimes(1);

    resolveJoin?.({
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
    });
    expect(await screen.findByLabelText("current path")).toHaveTextContent("/quest");
  });
});
