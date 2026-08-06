export function GroupPicker() {
  return (
    <section className="join-step">
      <p className="join-step__number" aria-hidden="true">
        2
      </p>
      <div>
        <h2 id="join-group-title">Enter your group code</h2>
        <p>Use the short code your teacher gave your group.</p>
        <label>
          Group code
          <input
            name="joinCode"
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            minLength={6}
            maxLength={16}
            required
          />
        </label>
      </div>
    </section>
  );
}
