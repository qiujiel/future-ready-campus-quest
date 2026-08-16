import { formatConceptLabel } from "../../learning/domain/concepts";
import type { ConceptId } from "../../shared/api/contracts";

export function MisconceptionPanel({
  conceptId,
  tags,
}: {
  conceptId: ConceptId;
  tags: Array<{ tag: string; count: number }>;
}) {
  return (
    <aside
      className="misconception-panel"
      aria-label={`${formatConceptLabel(conceptId)} misconception distribution`}
    >
      <h3>{formatConceptLabel(conceptId)} patterns</h3>
      {tags.length ? (
        <ul>
          {tags.map((entry) => (
            <li key={entry.tag}>{entry.tag}: {entry.count}</li>
          ))}
        </ul>
      ) : (
        <p>No tagged misconceptions yet.</p>
      )}
      <p>
        Next step: revisit the concept purpose, then ask learners to explain
        why their chosen approach fits the scenario.
      </p>
    </aside>
  );
}
