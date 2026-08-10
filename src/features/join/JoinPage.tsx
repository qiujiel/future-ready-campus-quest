import { type FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  type AuthGateway,
  supabaseAuthGateway,
} from "../../shared/api/authGateway";
import type { JoinCohortOutput } from "../../shared/api/contracts";
import { Button } from "../../ui/Button";
import { GroupPicker } from "./GroupPicker";
import { IdentityForm } from "./IdentityForm";
import { StudentPasscodeFields } from "./StudentPasscodeFields";

type EntryMode = "join" | "login";

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

function loginErrorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code.includes("LOGIN_NOT_AVAILABLE")) {
    return "Login is not available right now. Try again shortly.";
  }
  return "Name or passcode was not accepted. Check them and try again.";
}

export function JoinPage({
  gateway = supabaseAuthGateway,
  classAccessId: classAccessIdOverride,
  onJoined,
}: {
  gateway?: AuthGateway;
  classAccessId?: string;
  onJoined?: (result: JoinCohortOutput) => void;
}) {
  const navigate = useNavigate();
  const route = useParams<{ classAccessId?: string }>();
  const classAccessId = route.classAccessId ?? classAccessIdOverride;
  const requestKey = useRef(crypto.randomUUID());
  const [mode, setMode] = useState<EntryMode>("join");
  const [sessionRole, setSessionRole] = useState<
    "checking" | "teacher" | "student" | "none"
  >(classAccessId && gateway.getCurrentRole ? "checking" : "none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!classAccessId || !gateway.getCurrentRole) return;
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
  }, [classAccessId, gateway]);

  function selectMode(nextMode: EntryMode) {
    if (busy || nextMode === mode) return;
    setMode(nextMode);
    setError("");
    requestKey.current = crypto.randomUUID();
  }

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
    if (!classAccessId) return;

    const form = new FormData(event.currentTarget);
    const displayName = normalizeDisplayName(
      String(form.get("displayName") ?? ""),
    );
    const passcode = String(form.get("passcode") ?? "");

    if (
      mode === "join" &&
      passcode !== String(form.get("passcodeConfirmation") ?? "")
    ) {
      setError("Passcodes must match.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      if (mode === "join") {
        const joined = await gateway.joinCohort({
          classAccessId,
          joinCode: normalizeJoinCode(String(form.get("joinCode") ?? "")),
          displayName,
          passcode,
          wantsLeader: form.get("wantsLeader") === "yes",
          requestKey: requestKey.current,
        });
        if (onJoined) onJoined(joined);
        else navigate("/quest", { replace: true });
      } else {
        const loggedIn = await gateway.loginStudent({
          classAccessId,
          displayName,
          passcode,
          requestKey: requestKey.current,
        });
        if (onJoined) onJoined(loggedIn);
        else navigate("/quest", { replace: true });
      }
    } catch (caught) {
      setError(mode === "join" ? joinErrorMessage(caught) : loginErrorMessage(caught));
      if (mode === "login") requestKey.current = crypto.randomUUID();
    } finally {
      setBusy(false);
    }
  }

  if (!classAccessId) {
    return (
      <main className="route-shell">
        <p className="eyebrow">Student entry</p>
        <h1>Open your class link</h1>
        <p>Use the class link your teacher shared.</p>
        <p>The same class link works for every group in your class.</p>
      </main>
    );
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
        <h1>Join your class</h1>
        <p>Choose whether you are joining for the first time or returning.</p>
        <div className="hero-actions" aria-label="Student entry choice">
          <Button
            type="button"
            aria-pressed={mode === "join"}
            disabled={busy}
            onClick={() => selectMode("join")}
          >
            Join for the first time
          </Button>
          <Button
            type="button"
            variant="secondary"
            aria-pressed={mode === "login"}
            disabled={busy}
            onClick={() => selectMode("login")}
          >
            Log back in
          </Button>
        </div>

        <form className="stacked-form join-journey" onSubmit={submit}>
          <IdentityForm
            heading={mode === "join" ? "Tell your teacher who you are" : "Welcome back"}
          />
          {mode === "join" ? (
            <>
              <GroupPicker />
              <section className="join-step">
                <p className="join-step__number" aria-hidden="true">3</p>
                <div>
                  <h2>Create your private passcode</h2>
                  <p>Use four digits you can remember. Do not share them with classmates.</p>
                  <StudentPasscodeFields confirmation />
                </div>
              </section>
              <section className="join-step">
                <p className="join-step__number" aria-hidden="true">4</p>
                <div>
                  <fieldset>
                    <legend>Are you the group leader?</legend>
                    <label>
                      <input type="radio" name="wantsLeader" value="yes" />
                      Yes, I am the group leader
                    </label>
                    <label>
                      <input type="radio" name="wantsLeader" value="no" defaultChecked />
                      No, I am not the group leader
                    </label>
                  </fieldset>
                  <p>Your name is visible only to your teacher.</p>
                  <Button type="submit" busy={busy}>
                    {busy ? "Joining…" : "Join Group"}
                  </Button>
                </div>
              </section>
            </>
          ) : (
            <section className="join-step">
              <p className="join-step__number" aria-hidden="true">2</p>
              <div>
                <h2>Enter your passcode</h2>
                <StudentPasscodeFields />
                <Button type="submit" busy={busy}>
                  {busy ? "Logging in…" : "Continue to activity"}
                </Button>
              </div>
            </section>
          )}
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
          Your passcode stays private. Other students cannot see your name or
          individual learning results.
        </p>
      </aside>
    </main>
  );
}
