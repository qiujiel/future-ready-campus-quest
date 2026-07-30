import { render, screen } from "@testing-library/react";
import { App } from "../src/app/App";

it("renders a public shell without protected learning content", () => {
  render(<App />);

  expect(
    screen.getByRole("heading", { name: /future-ready campus quest/i }),
  ).toBeVisible();
  expect(screen.getByText(/join a teacher-led quest/i)).toBeVisible();
  expect(screen.queryByText(/answer key/i)).not.toBeInTheDocument();
});
