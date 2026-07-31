import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  SessionControls,
  type TeacherControlGateway,
} from "../../src/features/teacher/SessionControls";

it("requires confirmation before a class-wide change and reports impact", async () => {
  const execute = vi.fn(async () => ({ affected: 7 }));
  const gateway: TeacherControlGateway = { execute };
  render(
    <SessionControls
      cohortId="d3000000-0000-4000-8000-000000000001"
      cohortTitle="ICT 2A"
      activeStudents={7}
      gateway={gateway}
    />,
  );

  fireEvent.click(
    screen.getByRole("button", { name: /pause new quest starts/i }),
  );
  expect(execute).not.toHaveBeenCalled();
  expect(
    screen.getByRole("dialog", {
      name: /confirm pause new quest starts/i,
    }),
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", {
      name: /confirm pause for ICT 2A/i,
    }),
  );

  await waitFor(() =>
    expect(execute).toHaveBeenCalledWith({
      action: "set-quest-starts",
      cohortId: "d3000000-0000-4000-8000-000000000001",
      allowed: false,
    }),
  );
  expect(screen.getByRole("status")).toHaveTextContent(
    /confirmed.*7 active students/i,
  );
});

it("offers only a bounded five-minute phase extension", async () => {
  const execute = vi.fn(async () => ({ affected: 5 }));
  render(
    <SessionControls
      cohortId="d3000000-0000-4000-8000-000000000001"
      cohortTitle="ICT 2A"
      activeStudents={5}
      gateway={{ execute }}
    />,
  );

  fireEvent.click(
    screen.getByRole("button", { name: /extend final by 5 minutes/i }),
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: /confirm extension for ICT 2A/i,
    }),
  );

  await waitFor(() =>
    expect(execute).toHaveBeenCalledWith({
      action: "extend-phase",
      cohortId: "d3000000-0000-4000-8000-000000000001",
      phase: "final",
      seconds: 300,
    }),
  );
  expect(screen.queryByText(/token/i)).not.toBeInTheDocument();
});
