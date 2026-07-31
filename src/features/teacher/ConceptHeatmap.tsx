import type {
  ConceptAggregate,
  ConceptId,
  EvidenceCounts,
} from "../../shared/api/contracts";
import {
  evidencePercentage,
  heatmapIntensity,
} from "../../teacher/domain/dashboard";

export type EvidenceView = "first" | "final";

function EvidenceButton({
  conceptId,
  label,
  counts,
  onSelect,
}: {
  conceptId: ConceptId;
  label: EvidenceView;
  counts: EvidenceCounts;
  onSelect?: ((
    conceptId: ConceptId,
    view: EvidenceView,
  ) => void) | undefined;
}) {
  const percentage = evidencePercentage(counts);
  const readable = percentage === null
    ? "no evidence"
    : `${percentage}% secure`;
  return (
    <button
      className="heatmap-cell"
      data-intensity={heatmapIntensity(counts)}
      type="button"
      aria-label={`${conceptId} ${label} evidence: ${readable}; ${counts.needs_support} need support, ${counts.developing} developing, ${counts.secure} secure`}
      onClick={() => onSelect?.(conceptId, label)}
    >
      <strong>{readable}</strong>
      <small>{counts.secure} secure · {counts.needs_support} follow-up</small>
    </button>
  );
}

export function ConceptHeatmap({
  concepts,
  onSelect,
}: {
  concepts: ConceptAggregate[];
  onSelect?: ((
    conceptId: ConceptId,
    view: EvidenceView,
  ) => void) | undefined;
}) {
  return (
    <section className="teacher-panel" aria-labelledby="concept-evidence">
      <p className="eyebrow">C1–C8 evidence</p>
      <h2 id="concept-evidence">Concept follow-up map</h2>
      <p>
        First and final evidence stay separate. Retry is formative and never
        replaces the final result.
      </p>
      <div className="teacher-table-scroll">
        <table className="concept-heatmap">
          <caption className="sr-only">
            First, final, and formative retry evidence for C1 through C8
          </caption>
          <thead>
            <tr>
              <th scope="col">Concept</th>
              <th scope="col">First evidence</th>
              <th scope="col">Final evidence</th>
              <th scope="col">Formative retry</th>
            </tr>
          </thead>
          <tbody>
            {concepts.map((concept) => (
              <tr key={concept.conceptId}>
                <th scope="row">{concept.conceptId}</th>
                <td>
                  <EvidenceButton
                    conceptId={concept.conceptId}
                    label="first"
                    counts={concept.first}
                    onSelect={onSelect}
                  />
                </td>
                <td>
                  <EvidenceButton
                    conceptId={concept.conceptId}
                    label="final"
                    counts={concept.final}
                    onSelect={onSelect}
                  />
                </td>
                <td>
                  {concept.retryAttempted > 0
                    ? `Retry ${concept.retryCorrect} of ${concept.retryAttempted} correct`
                    : "No retry evidence"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
