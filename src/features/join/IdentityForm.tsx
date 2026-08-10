export function IdentityForm({
  heading = "Tell your teacher who you are",
}: {
  heading?: string;
}) {
  return (
    <section className="join-step">
      <p className="join-step__number" aria-hidden="true">
        1
      </p>
      <div>
        <h2 id="join-identity-title">{heading}</h2>
        <div className="join-fields">
          <label htmlFor="student-display-name">Your name</label>
          <input
            id="student-display-name"
            name="displayName"
            autoComplete="name"
            aria-describedby="student-display-name-help"
            maxLength={100}
            required
          />
          <small id="student-display-name-help">
            Use the name your teacher will recognize. Classmates see only a
            neutral explorer name.
          </small>
        </div>
      </div>
    </section>
  );
}
