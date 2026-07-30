import { type FormEvent, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  type AuthGateway,
  supabaseAuthGateway,
} from "../../shared/api/authGateway";

export function JoinPage({
  gateway = supabaseAuthGateway,
}: {
  gateway?: AuthGateway;
}) {
  const navigate = useNavigate();
  const { token = "" } = useParams();
  const requestKey = useRef(crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!token || token === "unavailable") {
    return (
      <main className="route-shell">
        <p className="eyebrow">Student entry</p>
        <h1>Use your class QR link</h1>
        <p>
          Ask your teacher to open the join window and scan the shared class QR
          code.
        </p>
      </main>
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const nickname = String(form.get("nickname") ?? "").trim();
    try {
      await gateway.joinCohort({
        joinToken: token,
        groupNumber: Number(form.get("groupNumber")),
        realName: String(form.get("realName") ?? ""),
        privacyConfirmed: form.get("privacyConfirmed") === "on",
        requestKey: requestKey.current,
        ...(nickname ? { nickname } : {}),
      });
      navigate("/quest", { replace: true });
    } catch {
      setError(
        "Joining was not completed. Check the group number or ask your teacher to reopen joining.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="join-layout">
      <section className="route-shell">
        <p className="eyebrow">Student entry</p>
        <h1>Join your campus quest</h1>
        <p>
          Choose the group number assigned by your teacher, then create your
          explorer identity.
        </p>
        <form className="stacked-form" onSubmit={submit}>
          <label>
            Assigned group number
            <input
              name="groupNumber"
              type="number"
              min={1}
              max={20}
              inputMode="numeric"
              defaultValue={1}
              required
            />
          </label>
          <label>
            Real name
            <input
              name="realName"
              autoComplete="name"
              maxLength={100}
              required
            />
            <small>Visible only to your teacher.</small>
          </label>
          <label>
            Nickname (optional)
            <input name="nickname" maxLength={40} />
            <small>
              Visible to your group. A neutral explorer name is generated if
              left blank.
            </small>
          </label>
          <label className="check-label">
            <input name="privacyConfirmed" type="checkbox" required />
            <span>
              I understand the class privacy notice: my real name is
              teacher-only, while my nickname and group identity are
              group-visible.
            </span>
          </label>
          <button type="submit" disabled={busy} aria-busy={busy}>
            {busy ? "Joining…" : "Join the campus"}
          </button>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </section>
      <aside className="privacy-card">
        <p className="eyebrow">Privacy at a glance</p>
        <h2>Your class, not a public profile</h2>
        <p>
          No student email, password, or PIN is needed. Other students never see
          your real name or individual learning results.
        </p>
      </aside>
    </main>
  );
}
