import { type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  type AuthGateway,
  supabaseAuthGateway,
} from "../../shared/api/authGateway";
import type { TeacherCohortListItem } from "../../shared/api/contracts";

export function TeacherSetupPage({
  gateway = supabaseAuthGateway,
}: {
  gateway?: AuthGateway;
}) {
  const navigate = useNavigate();
  const [cohorts, setCohorts] = useState<TeacherCohortListItem[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const createRequestKey = useRef("");
  const openRequestKey = useRef("");

  useEffect(() => {
    let active = true;
    if (!gateway.listCohorts) return;
    void gateway.listCohorts().then(
      (result) => {
        if (active) setCohorts(result);
      },
      () => {
        if (active) setStatus("Existing classes could not be loaded.");
      },
    );
    return () => {
      active = false;
    };
  }, [gateway]);

  async function createAndOpen(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    const form = new FormData(event.currentTarget);
    let createdCohortId: string;
    createRequestKey.current ||= crypto.randomUUID();
    try {
      const result = await gateway.createCohort({
        title: String(form.get("title") ?? ""),
        groupCount: Number(form.get("groupCount")),
        requestKey: createRequestKey.current,
      });
      createdCohortId = result.cohortId;
      createRequestKey.current = "";
    } catch {
      setStatus("The class could not be created. Try again.");
      setBusy(false);
      return;
    }
    openRequestKey.current ||= crypto.randomUUID();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await gateway.openJoinWindow(
          createdCohortId,
          openRequestKey.current,
        );
        openRequestKey.current = "";
        break;
      } catch {
        // One same-key retry resolves a lost response without duplicating the
        // atomic window. A persistent rejection remains visible on dashboard.
      }
    }
    setBusy(false);
    navigate(`/teacher/cohorts/${createdCohortId}`, { replace: true });
  }

  return (
    <main className="route-shell route-shell--wide">
      <p className="eyebrow">Class setup</p>
      <h1>Create your class</h1>
      {cohorts.length ? (
        <section className="control-panel" aria-labelledby="existing-classes">
          <h2 id="existing-classes">Open an existing class</h2>
          <ul>
            {cohorts.map((cohort) => (
              <li key={cohort.cohortId}>
                <strong>{cohort.title}</strong>{" "}
                <span>
                  {cohort.groupCount} groups
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
      <form className="stacked-form" onSubmit={createAndOpen}>
        <label>
          Class name
          <input name="title" maxLength={100} required />
        </label>
        <label>
          Number of groups
          <input name="groupCount" type="number" min={1} max={20} defaultValue={5} required />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "Creating class…" : "Create class and open joining"}
        </button>
      </form>
      <p role="status" aria-live="polite">{status}</p>
    </main>
  );
}
