import type { ConceptId, SupportState } from "../../shared/api/contracts";
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
            Your private evidence across concepts C1 to C8
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
                <th scope="row">{concept.conceptId}</th>
                <td>{evidenceLabels[concept.firstEvidence]}</td>
                <td>{evidenceLabels[concept.finalEvidence]}</td>
                <td>{retryLabels[concept.retryStatus]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
