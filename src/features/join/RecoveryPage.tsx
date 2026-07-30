import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  type AuthGateway,
  supabaseAuthGateway,
} from "../../shared/api/authGateway";

export function RecoveryPage({
  gateway = supabaseAuthGateway,
}: {
  gateway?: AuthGateway;
}) {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const requestKey = useRef(crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function recover() {
    setBusy(true);
    setError("");
    try {
      await gateway.recoverStudent({
        recoveryToken: token,
        requestKey: requestKey.current,
      });
      navigate("/quest", { replace: true });
    } catch {
      setError(
        "This recovery link is expired or already used. Ask your teacher for a new QR link.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="route-shell">
      <p className="eyebrow">Teacher-assisted recovery</p>
      <h1>Return to your quest</h1>
      <p>
        This single-use link restores your existing progress. It does not create
        a new learner profile.
      </p>
      <button type="button" onClick={recover} disabled={busy || !token}>
        {busy ? "Restoring…" : "Restore my session"}
      </button>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </main>
  );
}
