import { useState } from "react";
import type {
  TeacherControlCommand,
  TeacherControlReceipt,
} from "../../shared/api/contracts";
import { supabaseTeacherControlGateway } from "../../teacher/api/teacherControlGateway";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";

export interface TeacherControlGateway {
  execute(command: TeacherControlCommand): Promise<TeacherControlReceipt>;
}

export function SessionControls({
  cohortId,
  cohortTitle,
  activeStudents,
  gateway = supabaseTeacherControlGateway,
}: {
  cohortId: string;
  cohortTitle: string;
  activeStudents: number;
  gateway?: TeacherControlGateway;
}) {
  const [pending, setPending] = useState<TeacherControlCommand | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const title = pending?.action === "set-quest-starts"
    ? pending.allowed
      ? "Confirm resume new quest starts"
      : "Confirm pause new quest starts"
    : pending?.action === "extend-phase"
      ? "Confirm final phase extension"
      : pending?.action === "launch-quest"
        ? "Confirm launch quest"
      : pending?.action === "open-join"
        ? "Confirm open class joining"
        : pending?.action === "close-join"
          ? "Confirm close class joining"
          : pending?.action === "close-session"
            ? "Confirm close class session"
            : "Confirm class control";

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    try {
      const receipt = await gateway.execute(pending);
      setStatus(receipt.expiresAt
        ? `Control confirmed. Access expires at ${receipt.expiresAt}.`
        : `Control confirmed. ${receipt.affected} active students affected.`);
      setPending(null);
    } catch {
      setStatus("The control was not applied.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="teacher-panel" aria-labelledby="session-controls">
      <p className="eyebrow">Live operations</p>
      <h2 id="session-controls">Session controls</h2>
      <p>{activeStudents} students are currently active.</p>
      <div className="hero-actions">
        <Button
          onClick={() => setPending({ action: "launch-quest", cohortId })}
        >
          Launch quest
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            setPending({
              action: "open-join",
              cohortId,
            })}
        >
          Open joining
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            setPending({
              action: "close-join",
              cohortId,
            })}
        >
          Close joining
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            setPending({
              action: "set-quest-starts",
              cohortId,
              allowed: false,
            })}
        >
          Pause new quest starts
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            setPending({
              action: "extend-phase",
              cohortId,
              phase: "final",
              seconds: 300,
            })}
        >
          Extend final by 5 minutes
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            setPending({
              action: "set-quest-starts",
              cohortId,
              allowed: true,
            })}
        >
          Resume new quest starts
        </Button>
        <Button
          variant="danger"
          onClick={() =>
            setPending({
              action: "close-session",
              cohortId,
            })}
        >
          Close class session
        </Button>
      </div>
      <p role="status" aria-live="polite">{status}</p>
      <Dialog
        open={pending !== null}
        title={title}
        onClose={() => setPending(null)}
      >
        <p>
          {pending?.action === "launch-quest"
            ? "This creates a real saved attempt for every joined student and uses the active 24-item question bank."
            : <>This class-wide change applies only to <strong>{cohortTitle}</strong>{" "}and will be recorded in the teacher audit.</>}
        </p>
        <Button busy={busy} onClick={confirm}>
          {pending?.action === "extend-phase"
            ? `Confirm extension for ${cohortTitle}`
            : pending?.action === "launch-quest"
              ? `Confirm launch quest for ${cohortTitle}`
            : pending?.action === "set-quest-starts" && !pending.allowed
              ? `Confirm pause for ${cohortTitle}`
              : `Confirm ${title.toLowerCase().replace("confirm ", "")} for ${cohortTitle}`}
        </Button>
      </Dialog>
    </section>
  );
}
