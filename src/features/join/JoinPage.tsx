import { type FormEvent, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  type AuthGateway,
  supabaseAuthGateway,
} from "../../shared/api/authGateway";
import { Button } from "../../ui/Button";
import { GroupPicker } from "./GroupPicker";
import { IdentityForm } from "./IdentityForm";

function joinErrorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code.includes("JOIN_WINDOW_EXPIRED") || code.includes("JOIN_WINDOW_CLOSED")) {
    return "This joining window has closed. Ask your teacher to reopen joining.";
  }
  if (code.includes("GROUP_NOT_FOUND")) {
    return "Check the assigned group number and try again.";
  }
  if (code.includes("GROUP_FULL")) {
    return "Your assigned group is full. Ask your teacher where to join.";
  }
  return "Joining was not completed. Check the group number or ask your teacher to reopen joining.";
}

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
    } catch (caught) {
      setError(joinErrorMessage(caught));
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
        <form className="stacked-form join-journey" onSubmit={submit}>
          <GroupPicker />
          <IdentityForm />
          <section className="join-step">
            <p className="join-step__number" aria-hidden="true">
              3
            </p>
            <div>
              <h2 id="join-campus-title">Join the campus</h2>
              <p>
                You will enter your group space first, then begin when your
                teacher opens the quest.
              </p>
              <Button type="submit" busy={busy}>
                {busy ? "Joining…" : "Join the campus"}
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
          No student email, password, or PIN is needed. Other students never see
          your real name or individual learning results.
        </p>
      </aside>
    </main>
  );
}
