import type { ConceptId, SupportState } from "../../shared/api/contracts";
import { formatConceptLabel } from "../../learning/domain/concepts";
import { Card } from "../../ui/Card";

export interface ConceptDebrief {
  conceptId: ConceptId;
  firstEvidence: SupportState;
  finalEvidence: SupportState;
  retryStatus: "not-needed" | "ready" | "complete";
}

const evidenceLabels: Record<SupportState, string> = {
  needs_support: "Building foundations",
  developing: "Developing",
  secure: "Secure",
};

const retryLabels: Record<ConceptDebrief["retryStatus"], string> = {
  "not-needed": "No retry needed",
  ready: "Ready for a supported retry",
  complete: "Supported retry completed",
};

export function PersonalDebrief({
  concepts,
  explorerNickname,
}: {
  concepts: ConceptDebrief[];
  explorerNickname: string;
}) {
  return (
    <Card
      className="personal-debrief"
      eyebrow="Private to you"
      title={`${explorerNickname}'s growth route`}
    >
      <p>
        Compare your first and final evidence. These descriptions guide your
        next step; they are not public ranks.
      </p>
      <div className="results-table-scroll">
        <table className="results-table">
          <caption className="sr-only">
            Your private evidence across all eight named concepts
          </caption>
          <thead>
            <tr>
              <th scope="col">Concept</th>
              <th scope="col">First evidence</th>
              <th scope="col">Final evidence</th>
              <th scope="col">Next step</th>
            </tr>
          </thead>
          <tbody>
            {concepts.map((concept) => (
              <tr key={concept.conceptId}>
                <th scope="row" data-label="Concept">
                  {formatConceptLabel(concept.conceptId)}
                </th>
                <td data-label="First evidence">
                  {evidenceLabels[concept.firstEvidence]}
                </td>
                <td data-label="Final evidence">
                  {evidenceLabels[concept.finalEvidence]}
                </td>
                <td data-label="Next step">
                  {retryLabels[concept.retryStatus]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
