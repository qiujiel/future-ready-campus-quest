import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MissionCard } from "../../src/features/quest/MissionCard";
import { SortInteraction } from "../../src/features/quest/SortInteraction";
import type {
  LearningItemPayload,
  ResponseResult,
} from "../../src/shared/api/contracts";

const item: LearningItemPayload = {
  assignmentId: "assignment-C3",
  itemId: "item-C3",
  conceptId: "C3",
  phase: "mission",
  formative: false,
  stem: "Which action best prepares a team for responsible AI use?",
  interaction: {
    kind: "single-choice",
    options: [
      { id: "A", text: "Agree on a purpose and review risks" },
      { id: "B", text: "Use every available tool immediately" },
    ],
  },
  support: {
    conceptReminder: "Start with purpose, people, and possible impact.",
    sourcePageLabel: "Course guide p. 12",
  },
};

const correctResult: ResponseResult = {
  responseId: "response-1",
  correct: true,
  formative: false,
  explanation: "A shared purpose and risk review make responsible choices visible.",
  misconceptionTag: null,
  conceptState: "secure",
  nextPhase: "mission",
};

describe("mission interactions", () => {
  it("uses an explicit submit after a native single-choice selection", async () => {
    const submit = vi.fn(async () => correctResult);
    render(<MissionCard item={item} onSubmit={submit} />);

    const option = screen.getByRole("radio", {
      name: "Agree on a purpose and review risks",
    });
    fireEvent.click(option);
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText(/selected: agree on a purpose/i)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /confirm response/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(["A"]));
    expect(option).toBeDisabled();
    expect(screen.getByText("Correct")).toBeVisible();
    expect(screen.getByText(/shared purpose and risk review/i)).toBeVisible();
    expect(screen.getByText("Course guide p. 12")).toBeVisible();
  });

  it("supports multi-select with native checkboxes and selected-state text", () => {
    render(
      <MissionCard
        item={{
          ...item,
          interaction: {
            kind: "multi-select",
            options: [
              { id: "A", text: "Check the source" },
              { id: "B", text: "Ask who could be affected" },
              { id: "C", text: "Share private data" },
            ],
          },
        }}
        onSubmit={async () => correctResult}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Check the source" }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Ask who could be affected" }),
    );
    expect(screen.getByText(/2 options selected/i)).toBeVisible();
  });

  it("sorts scenarios with keyboard-operable Move Up and Move Down buttons", () => {
    render(
      <SortInteraction
        legend="Order the review steps"
        options={[
          { id: "A", text: "Check the output" },
          { id: "B", text: "Define the purpose" },
          { id: "C", text: "Share the result" },
        ]}
        disabled={false}
        onChange={() => {}}
      />,
    );

    const second = screen.getByRole("group", { name: /define the purpose/i });
    expect(within(second).getByText(/position 2 of 3/i)).toBeVisible();
    fireEvent.click(within(second).getByRole("button", { name: /move up/i }));
    expect(
      within(screen.getByRole("group", { name: /define the purpose/i })).getByText(
        /position 1 of 3/i,
      ),
    ).toBeVisible();
  });

  it("classifies every prompt using labelled native selects", async () => {
    const submit = vi.fn(async () => correctResult);
    render(
      <MissionCard
        item={{
          ...item,
          interaction: {
            kind: "classification",
            prompts: [
              { id: "A", text: "Designs the learning experience" },
              { id: "B", text: "Builds future-ready skills" },
            ],
            categories: ["Teachers", "Students"],
          },
        }}
        onSubmit={submit}
      />,
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Designs the learning experience" }),
      { target: { value: "Teachers" } },
    );
    fireEvent.change(
      screen.getByRole("combobox", { name: "Builds future-ready skills" }),
      { target: { value: "Students" } },
    );
    fireEvent.click(screen.getByRole("button", { name: /confirm response/i }));

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(["A=Teachers", "B=Students"]),
    );
  });

  it("keeps the answer available and explains reconnection after a failed submit", async () => {
    const submit = vi
      .fn<() => Promise<ResponseResult>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(correctResult);
    render(<MissionCard item={item} onSubmit={submit} />);
    fireEvent.click(
      screen.getByRole("radio", {
        name: "Agree on a purpose and review risks",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /confirm response/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /connection lost.*response is still selected/i,
    );
    expect(
      screen.getByRole("radio", {
        name: "Agree on a purpose and review risks",
      }),
    ).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /try saving again/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
  });

  it("presents misconception feedback constructively without adaptive labels", async () => {
    const result: ResponseResult = {
      ...correctResult,
      correct: false,
      explanation: "A fast answer can still miss who might be affected.",
      misconceptionTag: "speed-means-quality",
      conceptState: "needs_support",
    };
    render(<MissionCard item={item} onSubmit={async () => result} />);
    fireEvent.click(
      screen.getByRole("radio", {
        name: "Use every available tool immediately",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /confirm response/i }));

    expect(await screen.findByText("Not yet")).toBeVisible();
    expect(screen.getByText(/update your reasoning/i)).toBeVisible();
    expect(screen.getByText(/speed means quality/i)).toBeVisible();
    expect(screen.queryByText("needs_support")).not.toBeInTheDocument();
  });
});
