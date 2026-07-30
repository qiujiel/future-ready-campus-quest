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

function renderJoin(gateway: AuthGateway, token = "valid-class-token") {
  const router = createMemoryRouter(
    [
      { path: "/join/:token", element: <JoinPage gateway={gateway} /> },
      { path: "/quest", element: <CurrentPath /> },
    ],
    { initialEntries: [`/join/${token}`] },
  );
  render(<RouterProvider router={router} />);
}

function completeJoinForm() {
  fireEvent.change(
    screen.getByRole("spinbutton", { name: /assigned group number/i }),
    {
      target: { value: "4" },
    },
  );
  fireEvent.change(screen.getByLabelText(/^real name/i), {
    target: { value: "Synthetic Learner" },
  });
  fireEvent.change(screen.getByLabelText(/^nickname/i), {
    target: { value: "Bright Comet" },
  });
  fireEvent.click(screen.getByLabelText(/class privacy notice/i));
}

describe("student join flow", () => {
  it("presents the approved three-step journey and privacy boundaries", () => {
    renderJoin(
      joinGateway(async (input) => ({
        identity: {
          studentId: "student-1",
          cohortId: "cohort-1",
          groupId: "group-1",
          groupNumber: input.groupNumber,
          nickname: input.nickname ?? "Explorer 1",
          isGroupIdentityEditor: true,
        },
        accessToken: "access",
        refreshToken: "refresh",
      })),
    );

    expect(
      screen.getByRole("heading", { name: /choose your assigned group number/i }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: /create your explorer identity/i }),
    ).toBeVisible();
    expect(screen.getByText(/real name is visible only to your teacher/i)).toBeVisible();
    expect(screen.getByText(/nickname is visible to your group/i)).toBeVisible();
    expect(screen.queryByLabelText(/email|password|pin/i)).not.toBeInTheDocument();
  });

  it.each([
    ["JOIN_WINDOW_EXPIRED", /teacher to reopen joining/i],
    ["JOIN_WINDOW_CLOSED", /teacher to reopen joining/i],
    ["GROUP_NOT_FOUND", /check the assigned group number/i],
    ["INVALID_GROUP", /check the assigned group number/i],
    ["GROUP_FULL", /assigned group is full/i],
  ])("explains the recoverable %s state", async (code, message) => {
    renderJoin(
      joinGateway(async () => {
        throw new Error(code);
      }),
    );
    completeJoinForm();
    fireEvent.click(screen.getByRole("button", { name: /join the campus/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("requires a real name and blocks duplicate submission while joining", async () => {
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

    fireEvent.click(screen.getByRole("button", { name: /join the campus/i }));
    expect(joinCohort).not.toHaveBeenCalled();

    completeJoinForm();
    fireEvent.click(screen.getByRole("button", { name: /join the campus/i }));

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
        nickname: "Bright Comet",
        isGroupIdentityEditor: true,
      },
      accessToken: "access",
      refreshToken: "refresh",
    });
    expect(await screen.findByLabelText("current path")).toHaveTextContent("/quest");
  });

  it("shows the QR recovery message when no live token is available", () => {
    renderJoin(
      joinGateway(async () => {
        throw new Error("unused");
      }),
      "unavailable",
    );
    expect(
      screen.getByRole("heading", { name: /use your class qr link/i }),
    ).toBeVisible();
  });
});
