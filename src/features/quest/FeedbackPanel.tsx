import type { ResponseResult } from "../../shared/api/contracts";

function readableMisconception(value: string) {
  return value.replace(/[-_]+/g, " ");
}

export function FeedbackPanel({
  result,
  sourcePageLabel,
}: {
  result: ResponseResult;
  sourcePageLabel?: string;
}) {
  return (
    <section
      className={
        result.correct
          ? "feedback-panel feedback-panel--correct"
          : "feedback-panel feedback-panel--developing"
      }
      aria-labelledby="response-feedback-title"
    >
      <p className="eyebrow">Response feedback</p>
      <h3 id="response-feedback-title">{result.correct ? "Correct" : "Not yet"}</h3>
      <p>{result.explanation}</p>
      {!result.correct ? (
        <p>
          <strong>Update your reasoning:</strong>{" "}
          {result.misconceptionTag
            ? `Reconsider the idea that ${readableMisconception(result.misconceptionTag)}.`
            : "Try connecting the choice to its effect on people and purpose."}
        </p>
      ) : null}
      {sourcePageLabel ? (
        <p className="source-label">
          <strong>Source:</strong> {sourcePageLabel}
        </p>
      ) : null}
    </section>
  );
}
