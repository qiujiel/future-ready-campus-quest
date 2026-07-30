import { type FormEvent, useMemo, useState } from "react";
import type {
  LearningItemPayload,
  ResponseResult,
} from "../../shared/api/contracts";
import { Button } from "../../ui/Button";
import { ChoiceInteraction } from "./ChoiceInteraction";
import { FeedbackPanel } from "./FeedbackPanel";
import { SortInteraction } from "./SortInteraction";

function initialSelections(item: LearningItemPayload) {
  return item.interaction.kind === "scenario-sort"
    ? item.interaction.options.map((option) => option.id)
    : [];
}

export function MissionCard({
  item,
  onSubmit,
}: {
  item: LearningItemPayload;
  onSubmit: (selectedOptionIds: string[]) => Promise<ResponseResult>;
}) {
  const [selected, setSelected] = useState(() => initialSelections(item));
  const [classification, setClassification] = useState<Record<string, string>>(
    {},
  );
  const [busy, setBusy] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState("");
  const [result, setResult] = useState<ResponseResult | null>(null);
  const classificationInteraction =
    item.interaction.kind === "classification" ? item.interaction : null;

  const classificationSelections = useMemo(() => {
    if (item.interaction.kind !== "classification") return [];
    return item.interaction.prompts
      .filter((prompt) => Boolean(classification[prompt.id]))
      .map((prompt) => `${prompt.id}=${classification[prompt.id]}`);
  }, [classification, item.interaction]);

  const submission =
    item.interaction.kind === "classification"
      ? classificationSelections
      : selected;
  const complete =
    item.interaction.kind === "classification"
      ? submission.length === item.interaction.prompts.length
      : submission.length > 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!complete || busy || result) return;
    setBusy(true);
    setConnectionMessage("");
    try {
      setResult(await onSubmit(submission));
    } catch {
      setConnectionMessage(
        "Connection lost. Your response is still selected; try saving again when you reconnect.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="mission-card">
      <header className="mission-card__header">
        <p className="eyebrow">
          {item.phase === "mission" ? "Learning Lab mission" : "Campus challenge"} ·{" "}
          {item.conceptId}
        </p>
        <h2>{item.stem}</h2>
      </header>

      {item.support.conceptReminder ? (
        <aside className="adaptive-cue">
          <strong>Idea to carry with you:</strong>{" "}
          {item.support.conceptReminder}
        </aside>
      ) : null}

      <form onSubmit={submit} className="quest-stack">
        {item.interaction.kind === "single-choice" ||
        item.interaction.kind === "multi-select" ? (
          <ChoiceInteraction
            kind={item.interaction.kind}
            legend={
              item.interaction.kind === "single-choice"
                ? "Choose one response"
                : "Choose every response that applies"
            }
            options={item.interaction.options}
            selected={selected}
            disabled={Boolean(result) || busy}
            onChange={setSelected}
          />
        ) : item.interaction.kind === "scenario-sort" ? (
          <SortInteraction
            legend="Put the steps in the strongest order"
            options={item.interaction.options}
            disabled={Boolean(result) || busy}
            onChange={setSelected}
          />
        ) : (
          <fieldset className="classification-interaction" disabled={Boolean(result) || busy}>
            <legend>Match each statement to a category</legend>
            {classificationInteraction?.prompts.map((prompt) => (
              <label key={prompt.id}>
                <span>{prompt.text}</span>
                <select
                  aria-label={prompt.text}
                  value={classification[prompt.id] ?? ""}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setClassification((current) => ({
                      ...current,
                      [prompt.id]: value,
                    }));
                  }}
                  required
                >
                  <option value="">Choose a category</option>
                  {classificationInteraction
                    ? classificationInteraction.categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))
                    : null}
                </select>
              </label>
            ))}
          </fieldset>
        )}

        {connectionMessage ? (
          <p className="connection-note" role="status">
            {connectionMessage}
          </p>
        ) : null}

        {!result ? (
          <Button type="submit" busy={busy} disabled={!complete}>
            {connectionMessage
              ? "Try saving again"
              : busy
                ? "Saving response…"
                : "Confirm response"}
          </Button>
        ) : null}
      </form>

      {result ? (
        <FeedbackPanel
          result={result}
          {...(item.support.sourcePageLabel
            ? { sourcePageLabel: item.support.sourcePageLabel }
            : {})}
        />
      ) : null}
    </article>
  );
}
