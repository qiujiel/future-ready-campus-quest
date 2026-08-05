import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StudentExperiencePreview } from "../../src/features/preview/StudentExperiencePreview";

async function enterCampusMap() {
  render(
    <MemoryRouter>
      <StudentExperiencePreview />
    </MemoryRouter>,
  );

  fireEvent.change(
    screen.getByRole("spinbutton", { name: /assigned group number/i }),
    { target: { value: "2" } },
  );
  fireEvent.change(screen.getByLabelText(/^real name/i), {
    target: { value: "Synthetic Learner" },
  });
  fireEvent.change(screen.getByLabelText(/^nickname/i), {
    target: { value: "Bright Comet" },
  });
  fireEvent.click(screen.getByLabelText(/class privacy notice/i));
  fireEvent.click(screen.getByRole("button", { name: "Join the campus" }));

  fireEvent.click(
    await screen.findByRole("button", { name: "Continue to campus map" }),
  );
}

describe("synthetic student experience preview", () => {
  it("visits briefing and diagnostic before the learning labs", async () => {
    await enterCampusMap();

    expect(
      screen.getByRole("heading", { name: "Briefing Plaza" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Adaptive Learning Labs" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Enter Diagnostic Gate" }),
    );
    expect(
      screen.getByRole("heading", { name: "Diagnostic Gate" }),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Continue to Learning Labs" }),
    );
    expect(
      screen.getByRole("heading", { name: "Adaptive Learning Labs" }),
    ).toBeVisible();
  });
});
