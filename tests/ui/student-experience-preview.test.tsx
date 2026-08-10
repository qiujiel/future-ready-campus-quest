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
    screen.getByLabelText(/group code/i),
    { target: { value: "PREVIEW2" } },
  );
  fireEvent.change(screen.getByLabelText(/your name/i), {
    target: { value: "Synthetic Learner" },
  });
  fireEvent.change(screen.getByLabelText(/^create a 4-digit passcode$/i), {
    target: { value: "4826" },
  });
  fireEvent.change(screen.getByLabelText(/^confirm passcode$/i), {
    target: { value: "4826" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Join Group" }));

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
