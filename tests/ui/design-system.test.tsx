import { fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { Button } from "../../src/ui/Button";
import { Card } from "../../src/ui/Card";
import { Dialog } from "../../src/ui/Dialog";
import { MotionProvider } from "../../src/ui/motion/MotionProvider";
import { useQuestMotion } from "../../src/ui/motion/motionContext";
import { StatusPill } from "../../src/ui/StatusPill";
import { ToastRegion } from "../../src/ui/ToastRegion";

function DialogHarness() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={triggerRef} onClick={() => setOpen(true)}>
        Open briefing
      </button>
      <Dialog
        title="Mission briefing"
        open={open}
        returnFocusRef={triggerRef}
        onClose={() => setOpen(false)}
      >
        <p>Choose carefully. Speed does not affect your score.</p>
      </Dialog>
    </>
  );
}

function MotionProbe() {
  const motion = useQuestMotion();
  return (
    <output>
      {motion.reduced ? "reduced" : "full"}:{motion.duration}
    </output>
  );
}

describe("Quest design system", () => {
  it("exposes clear enabled, busy, and disabled button states", () => {
    const { rerender } = render(<Button>Begin diagnostic</Button>);

    expect(
      screen.getByRole("button", { name: "Begin diagnostic" }),
    ).toBeEnabled();

    rerender(<Button busy>Begin diagnostic</Button>);
    expect(screen.getByRole("button", { name: "Begin diagnostic" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(screen.getByRole("button", { name: "Begin diagnostic" })).toBeDisabled();
  });

  it("uses headings for cards and text labels for status", () => {
    render(
      <Card title="Diagnostic Gate">
        <StatusPill tone="complete">Complete</StatusPill>
      </Card>,
    );

    expect(
      screen.getByRole("heading", { name: "Diagnostic Gate" }),
    ).toBeVisible();
    expect(screen.getByText("Complete")).toHaveAttribute(
      "data-status",
      "complete",
    );
  });

  it("names dialogs, closes with Escape, and restores focus", () => {
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Open briefing" });

    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Mission briefing" });
    expect(dialog).toBeVisible();
    expect(screen.getByRole("button", { name: "Close mission briefing" })).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("announces non-urgent updates politely", () => {
    render(<ToastRegion message="Response saved" />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    expect(screen.getByRole("status")).toHaveTextContent("Response saved");
  });

  it("removes transition duration when reduced motion is requested", () => {
    const { rerender } = render(
      <MotionProvider forceReduced={false}>
        <MotionProbe />
      </MotionProvider>,
    );
    expect(screen.getByText("full:0.24")).toBeVisible();

    rerender(
      <MotionProvider forceReduced>
        <MotionProbe />
      </MotionProvider>,
    );
    expect(screen.getByText("reduced:0")).toBeVisible();
  });
});
