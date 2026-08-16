import { fireEvent, render, screen, within } from "@testing-library/react";
import { QuestShell } from "../../src/features/quest/QuestShell";

describe("Campus Quest shell", () => {
  it("shows the five destinations, phase states, and C1-C8 coverage", () => {
    render(
      <QuestShell
        phase="mission"
        completedPhases={["briefing", "diagnostic"]}
        visitedConcepts={["C1", "C2", "C3", "C4", "C5"]}
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
    expect(screen.getByText(/all eight named concepts/i)).toBeVisible();
  });

  it("does not show countdown or time-pressure guidance", () => {
    render(
      <QuestShell
        phase="diagnostic"
        completedPhases={["briefing"]}
        visitedConcepts={["C1"]}
      />,
    );

    expect(screen.queryByText(/\d+:\d+ remaining/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/moving on soon/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/speed/i)).not.toBeInTheDocument();
  });

  it("announces resume and phase changes while preserving the save receipt", () => {
    render(
      <QuestShell
        phase="final"
        completedPhases={["briefing", "diagnostic", "mission"]}
        visitedConcepts={["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"]}
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
      />,
    );
    const toggle = screen.getByRole("button", { name: /reduce animation/i });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/animation reduced/i)).toBeVisible();
  });
});
