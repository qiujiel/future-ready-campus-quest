import { fireEvent, render, screen } from "@testing-library/react";
import { QuestionBank } from "../../src/features/teacher/QuestionBank";
import type { TeacherQuestionBank } from "../../src/shared/api/contracts";
import type { TeacherGateway } from "../../src/teacher/api/teacherClient";

const bank: TeacherQuestionBank = {
  versionKey: "teacher-reviewed-v1",
  itemCount: 24,
  conceptCount: 8,
  items: Array.from({ length: 24 }, (_, index) => ({
    itemId: `C${Math.floor(index / 3) + 1}-Q${(index % 3) + 1}`,
    conceptId: `C${Math.floor(index / 3) + 1}` as TeacherQuestionBank["items"][number]["conceptId"],
    form: (["diagnostic", "practice", "final"] as const)[index % 3]!,
    stem: `Synthetic teacher review question ${index + 1}`,
    interaction: {
      kind: "single-choice" as const,
      options: [
        { id: "A", text: "Reviewed answer" },
        { id: "B", text: "Alternative answer" },
      ],
    },
    correctResponse: ["A"],
    rationale: "A concise teacher-only rationale for classroom review.",
    sourcePageLabels: ["overview-ict p. 1"],
  })),
};

it("reveals all 24 questions and answers only after the teacher asks", async () => {
  const gateway: TeacherGateway = {
    async getSummary() {
      throw new Error("not used");
    },
    async getQuestionBank() {
      return bank;
    },
  };
  render(<QuestionBank cohortId="cohort-1" gateway={gateway} />);

  expect(screen.queryByText(bank.items[0]!.stem)).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: /view complete question bank/i }),
  );

  expect(await screen.findByText(bank.items[0]!.stem)).toBeVisible();
  expect(screen.getByText(/24 questions across 8 concepts/i)).toBeVisible();
  expect(screen.getAllByText("Correct response:")).toHaveLength(24);
  expect(screen.getAllByText(/teacher-only rationale/i)).toHaveLength(24);
});

it("shows a safe retry message when the bank cannot be loaded", async () => {
  const gateway: TeacherGateway = {
    async getSummary() {
      throw new Error("not used");
    },
    async getQuestionBank() {
      throw new Error("database details must not be shown");
    },
  };
  render(<QuestionBank cohortId="cohort-1" gateway={gateway} />);
  fireEvent.click(
    screen.getByRole("button", { name: /view complete question bank/i }),
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    /question bank is not available.*try again/i,
  );
  expect(screen.queryByText(/database details/i)).not.toBeInTheDocument();
});
