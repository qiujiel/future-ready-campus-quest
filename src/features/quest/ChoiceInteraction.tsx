export function ChoiceInteraction({
  disabled,
  kind,
  legend,
  onChange,
  options,
  selected,
}: {
  disabled: boolean;
  kind: "single-choice" | "multi-select";
  legend: string;
  onChange: (ids: string[]) => void;
  options: Array<{ id: string; text: string }>;
  selected: string[];
}) {
  const multiple = kind === "multi-select";

  function toggle(id: string, checked: boolean) {
    if (!multiple) {
      onChange([id]);
      return;
    }
    onChange(
      checked
        ? options
            .map((option) => option.id)
            .filter((optionId) => optionId === id || selected.includes(optionId))
        : selected.filter((optionId) => optionId !== id),
    );
  }

  const selectedText = multiple
    ? `${selected.length} option${selected.length === 1 ? "" : "s"} selected`
    : selected.length === 1
      ? `Selected: ${options.find((option) => option.id === selected[0])?.text ?? ""}`
      : "No option selected";

  return (
    <fieldset className="choice-interaction" disabled={disabled}>
      <legend>{legend}</legend>
      <div className="choice-interaction__options">
        {options.map((option) => (
          <label
            key={option.id}
            className={
              selected.includes(option.id)
                ? "choice-option choice-option--selected"
                : "choice-option"
            }
          >
            <input
              type={multiple ? "checkbox" : "radio"}
              name={multiple ? `choice-${option.id}` : "single-choice"}
              value={option.id}
              checked={selected.includes(option.id)}
              onChange={(event) => toggle(option.id, event.currentTarget.checked)}
            />
            <span>{option.text}</span>
          </label>
        ))}
      </div>
      <p className="selection-summary" aria-live="polite">
        {selectedText}
      </p>
    </fieldset>
  );
}
