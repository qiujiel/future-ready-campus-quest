import { useState } from "react";
import { formatConceptLabel } from "../../learning/domain/concepts";
import type { TeacherQuestionBank } from "../../shared/api/contracts";
import type { TeacherGateway } from "../../teacher/api/teacherClient";
import { Button } from "../../ui/Button";

function correctResponseLabel(
  response: TeacherQuestionBank["items"][number]["correctResponse"],
) {
  if (Array.isArray(response)) return response.join(", ");
  return Object.entries(response)
    .map(([prompt, category]) => `${prompt} = ${category}`)
    .join("; ");
}

export function QuestionBank({
  cohortId,
  gateway,
}: {
  cohortId: string;
  gateway: TeacherGateway;
}) {
  const [bank, setBank] = useState<TeacherQuestionBank | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function load() {
    if (!gateway.getQuestionBank || loading) return;
    setLoading(true);
    setError(false);
    try {
      setBank(await gateway.getQuestionBank(cohortId));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="teacher-panel teacher-question-bank" aria-labelledby="question-bank-title">
      <div>
        <p className="eyebrow">Teacher-only content</p>
        <h2 id="question-bank-title">Complete question bank</h2>
        <p>
          Review the activity questions, correct responses, rationales, and
          source pages before class.
        </p>
      </div>
      {!bank ? (
        <Button busy={loading} onClick={() => void load()}>
          {error ? "Try loading question bank again" : "View complete question bank"}
        </Button>
      ) : null}
      {error ? (
        <p role="alert">
          The question bank is not available right now. Try again before
          launching the class.
        </p>
      ) : null}
      {bank ? (
        <div className="question-bank-list">
          <p role="status">
            {bank.itemCount} questions across {bank.conceptCount} concepts ·
            content version {bank.versionKey}
          </p>
          <ol>
            {bank.items.map((item) => (
              <li key={item.itemId} className="question-bank-item">
                <p className="eyebrow">
                  {item.itemId} · {formatConceptLabel(item.conceptId)} · {item.form}
                </p>
                <h3>{item.stem}</h3>
                {"options" in item.interaction ? (
                  <ul>
                    {item.interaction.options.map((option) => (
                      <li key={option.id}>
                        {option.id}. {option.text}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    Categories: {item.interaction.categories.join(", ")}
                  </p>
                )}
                <p>
                  <strong>Correct response:</strong>{" "}
                  {correctResponseLabel(item.correctResponse)}
                </p>
                <p>
                  <strong>Rationale:</strong> {item.rationale}
                </p>
                {item.sourcePageLabels.length ? (
                  <p>
                    <strong>Sources:</strong>{" "}
                    {item.sourcePageLabels.join(", ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
