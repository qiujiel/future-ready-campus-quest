import { render, screen } from "@testing-library/react";
import { QuestEntryPage } from "../../src/features/quest/QuestEntryPage";

it("welcomes an authenticated student into Briefing Plaza while the teacher prepares the quest", () => {
  render(<QuestEntryPage />);

  expect(
    screen.getByRole("heading", { name: "Briefing Plaza" }),
  ).toBeVisible();
  expect(screen.getByText(/you are in.*teacher will open/i)).toBeVisible();
  expect(screen.getByText(/waiting for teacher/i)).toBeVisible();
  expect(screen.getByText(/speed does not affect your score/i)).toBeVisible();
  expect(screen.queryByText(/next approved implementation plan/i)).not.toBeInTheDocument();
});
