import { useState } from "react";
import { Button } from "../../ui/Button";

export function SortInteraction({
  disabled,
  legend,
  onChange,
  options,
}: {
  disabled: boolean;
  legend: string;
  onChange: (ids: string[]) => void;
  options: Array<{ id: string; text: string }>;
}) {
  const [ordered, setOrdered] = useState(options);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;
    const next = [...ordered];
    const current = next[index];
    const replacement = next[target];
    if (!current || !replacement) return;
    next[index] = replacement;
    next[target] = current;
    setOrdered(next);
    onChange(next.map((option) => option.id));
  }

  return (
    <fieldset className="sort-interaction" disabled={disabled}>
      <legend>{legend}</legend>
      <ol>
        {ordered.map((option, index) => (
          <li key={option.id} role="group" aria-label={option.text}>
            <span className="sort-position">{index + 1}</span>
            <span>
              <strong>{option.text}</strong>
              <small>
                Position {index + 1} of {ordered.length}
              </small>
            </span>
            <span className="sort-actions">
              <Button
                variant="quiet"
                disabled={disabled || index === 0}
                onClick={() => move(index, -1)}
              >
                Move up
              </Button>
              <Button
                variant="quiet"
                disabled={disabled || index === ordered.length - 1}
                onClick={() => move(index, 1)}
              >
                Move down
              </Button>
            </span>
          </li>
        ))}
      </ol>
    </fieldset>
  );
}
