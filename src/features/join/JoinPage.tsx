import { type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  type AuthGateway,
  supabaseAuthGateway,
} from "../../shared/api/authGateway";
import type { JoinCohortOutput } from "../../shared/api/contracts";
import { Button } from "../../ui/Button";
import { GroupPicker } from "./GroupPicker";
import { IdentityForm } from "./IdentityForm";

function normalizeDisplayName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeJoinCode(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function joinErrorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code.includes("JOIN_WINDOW_CLOSED") || code.includes("INACTIVE_COHORT")) {
    return "Joining is closed right now. Ask your teacher to open it.";
  }
  if (code.includes("INVALID_JOIN_CODE") || code.includes("INVALID_GROUP")) {
    return "That group code was not recognized. Check it and try again.";
  }
  if (code.includes("GROUP_JOIN_CLOSED")) {
    return "Joining is closed for this group. Ask your teacher where to join.";
  }
  if (code.includes("GROUP_FULL")) {
    return "This group is full. Ask your teacher where to join.";
  }
  return "You could not join yet. Check your connection and group code, then try again.";
}

export function JoinPage({
  gateway = supabaseAuthGateway,
  onJoined,
}: {
  gateway?: AuthGateway;
  joinToken?: string;
  onJoined?: (result: JoinCohortOutput) => void;
}) {
  const navigate = useNavigate();
  const requestKey = useRef(crypto.randomUUID());
  const [sessionRole, setSessionRole] = useState<
    "checking" | "teacher" | "student" | "none"
  >(gateway.getCurrentRole ? "checking" : "none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!gateway.getCurrentRole) return;
    let active = true;
    void gateway.getCurrentRole().then(
      (role) => {
        if (active) setSessionRole(role ?? "none");
      },
      () => {
        if (active) setSessionRole("none");
      },
    );
    return () => {
      active = false;
    };
  }, [gateway]);

  async function startNewSession() {
    setBusy(true);
    setError("");
    try {
      await gateway.signOut?.();
      requestKey.current = crypto.randomUUID();
      setSessionRole("none");
    } catch {
      setError("The saved session could not be ended. Refresh and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const joined = await gateway.joinCohort({
        joinCode: normalizeJoinCode(String(form.get("joinCode") ?? "")),
        displayName: normalizeDisplayName(
          String(form.get("displayName") ?? ""),
        ),
        requestKey: requestKey.current,
      });
      if (onJoined) onJoined(joined);
      else navigate("/quest", { replace: true });
    } catch (caught) {
      setError(joinErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  if (sessionRole === "checking") {
    return (
      <main className="route-shell">
        <p role="status">Checking this browser for saved activity…</p>
      </main>
    );
  }

  if (sessionRole === "student") {
    return (
      <main className="route-shell">
        <p className="eyebrow">Student entry</p>
        <h1>Continue your activity</h1>
        <p>This browser already has a saved student session.</p>
        <div className="hero-actions">
          <a className="primary-action" href="#/quest">
            Continue Activity
          </a>
          <Button type="button" onClick={() => void startNewSession()} busy={busy}>
            Start a new student session
          </Button>
        </div>
        {error ? <p role="alert">{error}</p> : null}
      </main>
    );
  }

  if (sessionRole === "teacher") {
    return (
      <main className="route-shell">
        <p className="eyebrow">Teacher session</p>
        <h1>A teacher is signed in on this browser</h1>
        <p>Open the teacher workspace, or sign out before starting a student session.</p>
        <div className="hero-actions">
          <a className="primary-action" href="#/teacher">
            Teacher workspace
          </a>
          <Button type="button" onClick={() => void startNewSession()} busy={busy}>
            Sign out and join as a student
          </Button>
        </div>
        {error ? <p role="alert">{error}</p> : null}
      </main>
    );
  }

  return (
    <main className="join-layout">
      <section className="route-shell">
        <p className="eyebrow">Student entry</p>
        <h1>Join your group</h1>
        <p>Enter your name and the group code your teacher gave you.</p>
        <form className="stacked-form join-journey" onSubmit={submit}>
          <IdentityForm />
          <GroupPicker />
          <section className="join-step">
            <p className="join-step__number" aria-hidden="true">3</p>
            <div>
              <h2>Start the quest</h2>
              <p>
                By joining, you understand that your name is visible only to
                your teacher. Your work is saved to this browser session.
              </p>
              <Button type="submit" busy={busy}>
                {busy ? "Joining…" : "Join Group"}
              </Button>
            </div>
          </section>
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
          No student email, invitation, password, or verification is needed.
          Other students cannot see your name or individual learning results.
        </p>
      </aside>
    </main>
  );
}
