import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QuestShell } from "../../src/features/quest/QuestShell";

const now = new Date("2026-07-31T08:00:00.000Z");

describe("Campus Quest shell", () => {
  it("shows the five destinations, phase states, and C1-C8 coverage", () => {
    render(
      <QuestShell
        phase="mission"
        completedPhases={["briefing", "diagnostic"]}
        visitedConcepts={["C1", "C2", "C3", "C4", "C5"]}
        deadline="2026-07-31T08:05:00.000Z"
        now={now}
      />,
    );

    const route = within(screen.getByRole("list", { name: "Campus Quest route" }));
    for (const destination of [
      "Briefing Plaza",
      "Diagnostic Gate",
      "Adaptive Learning Labs",
      "Final Challenge Hall",
      "Reflection Garden",
    ]) {
      expect(route.getByText(destination)).toBeVisible();
    }
    expect(route.getByText("Briefing Plaza").closest("li")).toHaveAttribute(
      "data-phase-state",
      "complete",
    );
    expect(route.getByText("Adaptive Learning Labs").closest("li")).toHaveAttribute(
      "data-phase-state",
      "current",
    );
    expect(route.getByText("Final Challenge Hall").closest("li")).toHaveAttribute(
      "data-phase-state",
      "upcoming",
    );
    expect(screen.getByText(/5 of 8 concepts visited/i)).toBeVisible();
    expect(screen.getByText(/C1 through C8/i)).toBeVisible();
  });

  it("uses the server deadline for calm time guidance without speed scoring", () => {
    const { rerender } = render(
      <QuestShell
        phase="diagnostic"
        completedPhases={["briefing"]}
        visitedConcepts={["C1"]}
        deadline="2026-07-31T08:04:30.000Z"
        now={now}
      />,
    );

    expect(screen.getByText("4:30 remaining")).toBeVisible();
    expect(screen.getByText(/speed does not affect your score/i)).toBeVisible();
    expect(screen.queryByText(/moving on soon/i)).not.toBeInTheDocument();

    rerender(
      <QuestShell
        phase="diagnostic"
        completedPhases={["briefing"]}
        visitedConcepts={["C1"]}
        deadline="2026-07-31T08:00:45.000Z"
        now={now}
      />,
    );
    expect(screen.getByText(/moving on soon/i)).toBeVisible();
  });

  it("updates the deadline display while the phase remains active", () => {
    vi.useFakeTimers();
    render(
      <QuestShell
        phase="diagnostic"
        completedPhases={["briefing"]}
        visitedConcepts={["C1"]}
        deadline="2026-07-31T08:00:03.000Z"
        now={now}
      />,
    );

    expect(screen.getByText("0:03 remaining")).toBeVisible();
    act(() => vi.advanceTimersByTime(2_000));
    expect(screen.getByText("0:01 remaining")).toBeVisible();
    vi.useRealTimers();
  });

  it("announces resume and phase changes while preserving the save receipt", () => {
    render(
      <QuestShell
        phase="final"
        completedPhases={["briefing", "diagnostic", "mission"]}
        visitedConcepts={["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"]}
        deadline="2026-07-31T08:06:00.000Z"
        now={now}
        resumed
        transitionMessage="Challenge Hall is now open."
        lastAcknowledgement="Your C8 mission response was saved."
      />,
    );

    expect(screen.getByText(/welcome back.*restored/i)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      /challenge hall is now open.*C8 mission response was saved/i,
    );
  });

  it("keeps a visible animation preference independent of the system setting", () => {
    render(
      <QuestShell
        phase="briefing"
        completedPhases={[]}
        visitedConcepts={[]}
        deadline="2026-07-31T08:02:00.000Z"
        now={now}
      />,
    );
    const toggle = screen.getByRole("button", { name: /reduce animation/i });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/animation reduced/i)).toBeVisible();
  });
});
