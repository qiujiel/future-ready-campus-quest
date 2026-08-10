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
  loginStudent: NonNullable<AuthGateway["loginStudent"]> = vi.fn(),
): AuthGateway {
  return {
    async signInTeacher() {},
    async createCohort() {
      return { cohortId: "cohort-1" };
    },
    joinCohort,
    loginStudent,
    async recoverStudent() {
      throw new Error("unused");
    },
  };
}

function renderJoin(gateway: AuthGateway) {
  const router = createMemoryRouter(
    [
      { path: "/class/:classAccessId", element: <JoinPage gateway={gateway} /> },
      { path: "/quest", element: <CurrentPath /> },
    ],
    { initialEntries: ["/class/40000000-0000-4000-8000-000000000099"] },
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
  fireEvent.change(screen.getByLabelText(/^create a 4-digit passcode$/i), {
    target: { value: "4826" },
  });
  fireEvent.change(screen.getByLabelText(/^confirm passcode$/i), {
    target: { value: "4826" },
  });
}

describe("student join flow", () => {
  it("presents explicit first-time and returning choices with a private passcode", () => {
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

    expect(screen.getByRole("button", { name: /join for the first time/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /log back in/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("heading", { name: /tell your teacher who you are/i })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: /enter your group code/i }),
    ).toBeVisible();
    expect(screen.getByText(/classmates see only a neutral explorer name/i)).toBeVisible();
    expect(screen.getByText(/name is visible only to your teacher/i)).toBeVisible();
    expect(screen.getByLabelText(/^create a 4-digit passcode$/i)).toHaveAttribute(
      "pattern",
      "[0-9]{4}",
    );
    expect(screen.getByLabelText(/no, i am not the group leader/i)).toBeChecked();
  });

  it("sends class scope, passcode, and the leader choice on first-time join", async () => {
    const joinCohort = vi.fn(async () => ({
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
    }));
    renderJoin(joinGateway(joinCohort));

    completeJoinForm();
    fireEvent.click(screen.getByLabelText(/yes, i am the group leader/i));
    fireEvent.click(screen.getByRole("button", { name: /^join group$/i }));

    await waitFor(() => expect(joinCohort).toHaveBeenCalledTimes(1));
    expect(joinCohort).toHaveBeenCalledWith({
      classAccessId: "40000000-0000-4000-8000-000000000099",
      displayName: "Synthetic Learner",
      joinCode: "CAMPUS42",
      passcode: "4826",
      wantsLeader: true,
      requestKey: expect.stringMatching(/^[0-9a-f-]{36}$/i),
    });
  });

  it("blocks mismatched passcodes before calling the join boundary", async () => {
    const joinCohort = vi.fn();
    renderJoin(joinGateway(joinCohort));
    completeJoinForm();
    fireEvent.change(screen.getByLabelText(/^confirm passcode$/i), {
      target: { value: "4827" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^join group$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Passcodes must match.");
    expect(joinCohort).not.toHaveBeenCalled();
  });

  it("logs a returning student in with only class, name, and passcode", async () => {
    const loginStudent = vi.fn(async () => ({
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
    }));
    renderJoin(joinGateway(vi.fn(), loginStudent));
    fireEvent.click(screen.getByRole("button", { name: /log back in/i }));

    expect(screen.queryByLabelText(/group code/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/group leader/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^your name$/i), {
      target: { value: "  Alex   Tan " },
    });
    fireEvent.change(screen.getByLabelText(/^4-digit passcode$/i), {
      target: { value: "4826" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue to activity/i }));

    await waitFor(() => expect(loginStudent).toHaveBeenCalledTimes(1));
    expect(loginStudent).toHaveBeenCalledWith({
      classAccessId: "40000000-0000-4000-8000-000000000099",
      displayName: "Alex Tan",
      passcode: "4826",
      requestKey: expect.stringMatching(/^[0-9a-f-]{36}$/i),
    });
    expect(await screen.findByLabelText("current path")).toHaveTextContent("/quest");
  });

  it("keeps rejected login details out of errors, navigation, and browser storage", async () => {
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");
    const loginStudent = vi.fn()
      .mockRejectedValueOnce(new Error("STUDENT_LOGIN_NOT_ACCEPTED"))
      .mockResolvedValueOnce({
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
      });
    renderJoin(joinGateway(vi.fn(), loginStudent));
    fireEvent.click(screen.getByRole("button", { name: /log back in/i }));
    fireEvent.change(screen.getByLabelText(/^your name$/i), {
      target: { value: "Unknown Learner" },
    });
    fireEvent.change(screen.getByLabelText(/^4-digit passcode$/i), {
      target: { value: "4826" },
    });
    fireEvent.click(screen.getByRole("button", { name: /continue to activity/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Name or passcode was not accepted.");
    expect(alert).not.toHaveTextContent("4826");
    expect(window.location.href).not.toContain("4826");
    expect(storageWrite).not.toHaveBeenCalledWith(expect.anything(), "4826");

    fireEvent.click(screen.getByRole("button", { name: /continue to activity/i }));
    await waitFor(() => expect(loginStudent).toHaveBeenCalledTimes(2));
    expect(loginStudent.mock.calls[1]?.[0].requestKey).not.toBe(
      loginStudent.mock.calls[0]?.[0].requestKey,
    );
    storageWrite.mockRestore();
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
