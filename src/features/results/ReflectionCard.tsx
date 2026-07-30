import { type FormEvent, useState } from "react";
import type {
  ReflectionChoice,
  ReflectionPrompt,
} from "../../shared/api/contracts";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";

const choiceLabels: Record<ReflectionChoice, string> = {
  apply: "Apply it in a new situation",
  discuss: "Discuss it with my group",
  revisit: "Revisit the idea with support",
};

function noteKey(attemptId: string) {
  return `campus-quest-reflection-${attemptId}`;
}

function readNote(attemptId: string) {
  try {
    return localStorage.getItem(noteKey(attemptId)) ?? "";
  } catch {
    return "";
  }
}

export function ReflectionCard({
  attemptId,
  onSubmit,
  prompt,
}: {
  attemptId: string;
  onSubmit: (input: {
    choice: ReflectionChoice;
    note: string;
  }) => Promise<void>;
  prompt: ReflectionPrompt;
}) {
  const [choice, setChoice] = useState<ReflectionChoice | "">("");
  const [note, setNote] = useState(() => readNote(attemptId));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function updateNote(value: string) {
    setNote(value);
    try {
      if (value) localStorage.setItem(noteKey(attemptId), value);
      else localStorage.removeItem(noteKey(attemptId));
    } catch {
      // The note remains available in memory for this session.
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!choice || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await onSubmit({ choice, note: note.trim() });
      localStorage.removeItem(noteKey(attemptId));
      setMessage("Reflection saved privately");
    } catch {
      setMessage("Reflection saved on this device and will retry when connected");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      className="reflection-card"
      eyebrow={`Reflection focus · ${prompt.conceptId}`}
      title="Carry one idea forward"
    >
      <p className="reflection-prompt">{prompt.prompt}</p>
      <form className="quest-stack" onSubmit={submit}>
        <fieldset className="reflection-choices">
          <legend>Choose your next move</legend>
          {prompt.choices.map((value) => (
            <label key={value}>
              <input
                type="radio"
                name="reflection-choice"
                value={value}
                checked={choice === value}
                onChange={() => setChoice(value)}
              />
              <span>{choiceLabels[value]}</span>
            </label>
          ))}
        </fieldset>
        <label className="reflection-note">
          Private note (optional)
          <textarea
            value={note}
            maxLength={prompt.noteMaxLength}
            rows={4}
            onChange={(event) => updateNote(event.currentTarget.value)}
          />
          <small>
            Only you and your teacher can access this note. {note.length}/
            {prompt.noteMaxLength}
          </small>
        </label>
        <Button type="submit" busy={busy} disabled={!choice}>
          Finish reflection
        </Button>
        {message ? (
          <p className="reflection-status" role="status">
            {message}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
