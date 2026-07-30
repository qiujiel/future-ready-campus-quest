export function GroupPicker() {
  return (
    <section className="join-step">
      <p className="join-step__number" aria-hidden="true">
        1
      </p>
      <div>
        <h2 id="join-group-title">Choose your assigned group number</h2>
        <p>Use the number your teacher gave you. You can check it before joining.</p>
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
      </div>
    </section>
  );
}
