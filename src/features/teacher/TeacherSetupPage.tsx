import { type FormEvent, useState } from "react";
import {
  type AuthGateway,
  supabaseAuthGateway,
} from "../../shared/api/authGateway";

export function TeacherSetupPage({
  gateway = supabaseAuthGateway,
}: {
  gateway?: AuthGateway;
}) {
  const [cohortId, setCohortId] = useState("");
  const [joinWindow, setJoinWindow] = useState<{
    joinUrl: string;
    expiresAt: string;
  } | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await gateway.createCohort({
        title: String(form.get("title") ?? ""),
        groupCount: Number(form.get("groupCount")),
        groupCapacity: Number(form.get("groupCapacity")),
        requestKey: crypto.randomUUID(),
      });
      setCohortId(result.cohortId);
      setStatus("Cohort created. Joining remains closed.");
    } catch {
      setStatus("The cohort could not be created. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function openWindow() {
    if (!cohortId || !gateway.openJoinWindow) return;
    setBusy(true);
    try {
      const window = await gateway.openJoinWindow(
        cohortId,
        crypto.randomUUID(),
      );
      setJoinWindow(window);
      setStatus("The 15-minute join window is open.");
    } catch {
      setStatus("The join window could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  async function closeWindow() {
    if (!cohortId || !gateway.closeJoinWindow) return;
    setBusy(true);
    try {
      await gateway.closeJoinWindow(cohortId, crypto.randomUUID());
      setJoinWindow(null);
      setStatus("Joining is closed.");
    } catch {
      setStatus("The join window could not be closed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="route-shell route-shell--wide">
      <p className="eyebrow">Cohort setup</p>
      <h1>Prepare the class quest</h1>
      <form className="stacked-form" onSubmit={create}>
        <label>
          Cohort title
          <input name="title" maxLength={100} required />
        </label>
        <div className="field-grid">
          <label>
            Number of groups
            <input
              name="groupCount"
              type="number"
              min={1}
              max={20}
              defaultValue={5}
              required
            />
          </label>
          <label>
            Students per group
            <input
              name="groupCapacity"
              type="number"
              min={1}
              max={20}
              defaultValue={6}
              required
            />
          </label>
        </div>
        <button type="submit" disabled={busy || Boolean(cohortId)}>
          Create cohort
        </button>
      </form>
      {cohortId ? (
        <section className="control-panel" aria-labelledby="join-controls">
          <h2 id="join-controls">Class joining</h2>
          <p>Joining is closed by default. Open it only when the class is ready.</p>
          <div className="hero-actions">
            <button
              type="button"
              onClick={openWindow}
              disabled={busy || Boolean(joinWindow)}
            >
              Open 15-minute window
            </button>
            <button
              type="button"
              onClick={closeWindow}
              disabled={busy || !joinWindow}
            >
              Close joining
            </button>
          </div>
          {joinWindow ? (
            <p className="join-receipt">
              Class link: <a href={joinWindow.joinUrl}>{joinWindow.joinUrl}</a>
              <br />
              Expires: <time dateTime={joinWindow.expiresAt}>{joinWindow.expiresAt}</time>
            </p>
          ) : null}
        </section>
      ) : null}
      <p role="status" aria-live="polite">
        {status}
      </p>
    </main>
  );
}
