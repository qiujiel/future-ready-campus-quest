export function IdentityForm() {
  return (
    <section className="join-step">
      <p className="join-step__number" aria-hidden="true">
        2
      </p>
      <div>
        <h2 id="join-identity-title">Create your explorer identity</h2>
        <div className="join-fields">
          <label>
            Real name
            <input
              name="realName"
              autoComplete="name"
              maxLength={100}
              required
            />
            <small>Your real name is visible only to your teacher.</small>
          </label>
          <label>
            Nickname (optional)
            <input name="nickname" maxLength={40} />
            <small>
              Your nickname is visible to your group. A neutral explorer name is
              generated if you leave this blank.
            </small>
          </label>
        </div>
        <label className="check-label">
          <input name="privacyConfirmed" type="checkbox" required />
          <span>
            I understand the class privacy notice: my real name is teacher-only,
            while my nickname and group identity are group-visible.
          </span>
        </label>
      </div>
    </section>
  );
}
