import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  type AuthGateway,
  supabaseAuthGateway,
} from "../../shared/api/authGateway";
import type {
  JoinWindowReceipt,
  TeacherCohortListItem,
} from "../../shared/api/contracts";

export function TeacherSetupPage({
  gateway = supabaseAuthGateway,
  stayAfterCreate = false,
}: {
  gateway?: AuthGateway;
  stayAfterCreate?: boolean;
}) {
  const navigate = useNavigate();
  const [cohortId, setCohortId] = useState("");
  const [cohorts, setCohorts] = useState<TeacherCohortListItem[]>([]);
  const [joinWindow, setJoinWindow] = useState<JoinWindowReceipt | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (!gateway.listCohorts) return;
    void gateway.listCohorts().then(
      (result) => {
        if (active) setCohorts(result);
      },
      () => {
        if (active) setStatus("Existing cohorts could not be loaded.");
      },
    );
    return () => {
      active = false;
    };
  }, [gateway]);

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
      if (stayAfterCreate) {
        setStatus("Cohort created. Joining remains closed.");
      } else {
        navigate(`/teacher/cohorts/${result.cohortId}`, { replace: true });
      }
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
      const window = await gateway.openJoinWindow(cohortId, crypto.randomUUID());
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
      {cohorts.length ? (
        <section className="control-panel" aria-labelledby="existing-cohorts">
          <h2 id="existing-cohorts">Open an existing cohort</h2>
          <ul>
            {cohorts.map((cohort) => (
              <li key={cohort.cohortId}>
                <strong>{cohort.title}</strong>{" "}
                <span>
                  {cohort.groupCount} groups · {cohort.groupCapacity} students each
                </span>{" "}
                <a
                  href={`#/teacher/cohorts/${cohort.cohortId}`}
                  aria-label={`Open ${cohort.title} dashboard`}
                >
                  Open dashboard
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <form className="stacked-form" onSubmit={create}>
        <label>
          Cohort title
          <input name="title" maxLength={100} required />
        </label>
        <div className="field-grid">
          <label>
            Number of groups
            <input name="groupCount" type="number" min={1} max={20} defaultValue={5} required />
          </label>
          <label>
            Students per group
            <input name="groupCapacity" type="number" min={1} max={20} defaultValue={6} required />
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
            <button type="button" onClick={openWindow} disabled={busy || Boolean(joinWindow)}>
              Open joining for 15 minutes
            </button>
            <button type="button" onClick={closeWindow} disabled={busy || !joinWindow}>
              Close joining
            </button>
          </div>
          {joinWindow ? (
            <div className="join-receipt">
              <p>
                <a href={joinWindow.studentUrl}>Student application</a>
                <br />
                Expires: <time dateTime={joinWindow.expiresAt}>{joinWindow.expiresAt}</time>
              </p>
              <table>
                <caption>Group codes for this join window</caption>
                <thead><tr><th>Group</th><th>Code</th></tr></thead>
                <tbody>
                  {joinWindow.groups.map((group) => (
                    <tr key={group.groupId}>
                      <th scope="row">Group {group.groupNumber}</th>
                      <td><strong>{group.joinCode}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}
      <p role="status" aria-live="polite">{status}</p>
    </main>
  );
}
