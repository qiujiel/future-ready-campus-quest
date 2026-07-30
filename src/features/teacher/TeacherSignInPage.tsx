import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  type AuthGateway,
  supabaseAuthGateway,
} from "../../shared/api/authGateway";

export function TeacherSignInPage({
  gateway = supabaseAuthGateway,
}: {
  gateway?: AuthGateway;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await gateway.signInTeacher(
        String(form.get("email") ?? ""),
        String(form.get("password") ?? ""),
      );
      navigate("/teacher/setup", { replace: true });
    } catch {
      setError("Sign-in was not accepted. Check your details and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="route-shell">
      <p className="eyebrow">Teacher access</p>
      <h1>Teacher sign in</h1>
      <p>Use your provisioned teacher account to manage a private cohort.</p>
      <form className="stacked-form" onSubmit={submit}>
        <label>
          Email address
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <button type="submit" disabled={busy} aria-busy={busy}>
          {busy ? "Signing in…" : "Sign in securely"}
        </button>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </main>
  );
}
