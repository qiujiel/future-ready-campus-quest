import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PersonalDebrief } from "../../src/features/results/PersonalDebrief";
import { ReflectionCard } from "../../src/features/results/ReflectionCard";
import { TeamLeaderboard } from "../../src/features/results/TeamLeaderboard";
import type { ConceptId, ReflectionPrompt } from "../../src/shared/api/contracts";

const concepts = Array.from({ length: 8 }, (_, index) => ({
  conceptId: `C${index + 1}` as ConceptId,
  firstEvidence: index < 3 ? ("needs_support" as const) : ("developing" as const),
  finalEvidence: index < 6 ? ("secure" as const) : ("developing" as const),
  retryStatus: index === 7 ? ("ready" as const) : ("not-needed" as const),
}));

describe("private results experience", () => {
  it("shows only the current student's concept changes and retry guidance", () => {
    render(
      <PersonalDebrief
        explorerNickname="Bright Comet"
        concepts={concepts}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /bright comet.*growth route/i }),
    ).toBeVisible();
    for (let concept = 1; concept <= 8; concept += 1) {
      expect(screen.getByRole("row", { name: new RegExp(`C${concept}`) })).toBeVisible();
    }
    expect(screen.getByText(/ready for a supported retry/i)).toBeVisible();
    expect(screen.queryByText("Peer Person")).not.toBeInTheDocument();
    expect(screen.queryByText("Other Explorer")).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+\.\d+%/)).not.toBeInTheDocument();
  });

  it("preserves the private reflection note locally until submission succeeds", async () => {
    const prompt: ReflectionPrompt = {
      conceptId: "C8",
      prompt: "Where could your group apply this idea next?",
      choices: ["apply", "discuss", "revisit"],
      noteMaxLength: 240,
    };
    const submit = vi.fn(async () => {});
    const { unmount } = render(
      <ReflectionCard
        attemptId="attempt-1"
        prompt={prompt}
        onSubmit={submit}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: /apply it/i }));
    fireEvent.change(screen.getByLabelText(/private note/i), {
      target: { value: "Use it when planning our next class project." },
    });
    unmount();

    render(
      <ReflectionCard
        attemptId="attempt-1"
        prompt={prompt}
        onSubmit={submit}
      />,
    );
    expect(screen.getByLabelText(/private note/i)).toHaveValue(
      "Use it when planning our next class project.",
    );
    fireEvent.click(screen.getByRole("radio", { name: /apply it/i }));
    fireEvent.click(screen.getByRole("button", { name: /finish reflection/i }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        choice: "apply",
        note: "Use it when planning our next class project.",
      }),
    );
    expect(localStorage.getItem("campus-quest-reflection-attempt-1")).toBeNull();
  });

  it("ranks teams with shared ranks and no individual peer data", () => {
    const teams = [
      {
        groupId: "g1",
        groupName: "Future Makers",
        score: 88,
        completionStatus: "complete" as const,
        students: [{ name: "Peer Person", score: 99 }],
      },
      {
        groupId: "g2",
        groupName: "Bright Builders",
        score: 88,
        completionStatus: "complete" as const,
        students: [{ name: "Other Explorer", score: 76 }],
      },
      {
        groupId: "g3",
        groupName: "Curious Crew",
        score: null,
        completionStatus: "awaiting" as const,
        students: [],
      },
    ];
    render(
      <TeamLeaderboard teams={teams} />,
    );

    expect(screen.getByRole("row", { name: /Future Makers/ })).toHaveTextContent(
      /rank 1.*88/i,
    );
    expect(screen.getByRole("row", { name: /Bright Builders/ })).toHaveTextContent(
      /rank 1.*88/i,
    );
    expect(screen.getByRole("row", { name: /Curious Crew/ })).toHaveTextContent(
      /awaiting completion/i,
    );
    expect(screen.queryByText(/student score|individual rank/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Peer Person")).not.toBeInTheDocument();
    expect(screen.queryByText("Other Explorer")).not.toBeInTheDocument();
  });

  it("explains the team formula without presenting speed as an input", () => {
    render(<TeamLeaderboard teams={[]} />);

    expect(screen.getByText(/60% mastery/i)).toBeVisible();
    expect(screen.getByText(/25% improvement/i)).toBeVisible();
    expect(screen.getByText(/10% mission completion/i)).toBeVisible();
    expect(screen.getByText(/5% reflection/i)).toBeVisible();
    expect(screen.getByText(/speed is not part of the score/i)).toBeVisible();
  });
});
