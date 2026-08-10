export function StudentPasscodeFields({
  confirmation = false,
}: {
  confirmation?: boolean;
}) {
  return (
    <div className="join-fields">
      <label htmlFor="student-passcode">
        {confirmation ? "Create a 4-digit passcode" : "4-digit passcode"}
      </label>
      <input
        id="student-passcode"
        name="passcode"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        pattern="[0-9]{4}"
        minLength={4}
        maxLength={4}
        required
      />
      {confirmation ? (
        <>
          <label htmlFor="student-passcode-confirmation">Confirm passcode</label>
          <input
            id="student-passcode-confirmation"
            name="passcodeConfirmation"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]{4}"
            minLength={4}
            maxLength={4}
            required
          />
        </>
      ) : null}
    </div>
  );
}
