export function IdentityForm() {
  return (
    <section className="join-step">
      <p className="join-step__number" aria-hidden="true">
        1
      </p>
      <div>
        <h2 id="join-identity-title">Tell your teacher who you are</h2>
        <div className="join-fields">
          <label>
            Your name
            <input
              name="displayName"
              autoComplete="name"
              maxLength={100}
              required
            />
            <small>
              Use the name your teacher will recognize. Classmates see only a
              neutral explorer name.
            </small>
          </label>
        </div>
      </div>
    </section>
  );
}
