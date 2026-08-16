import type { ConceptId } from "../../shared/api/contracts";

export const conceptLabels: Record<ConceptId, string> = {
  C1: "Purposeful technology use",
  C2: "Singapore's educational technology journey",
  C3: "EdTech Masterplan 2030",
  C4: "MOE e-Pedagogy",
  C5: "Authentic learning",
  C6: "Active learning",
  C7: "Reflective learning",
  C8: "Collaborative learning",
};

export function formatConceptLabel(conceptId: ConceptId) {
  return `${conceptId} — ${conceptLabels[conceptId]}`;
}

export function conceptIdFromMisconceptionTag(value: string): ConceptId | null {
  const match = /^(C[1-8])(?:[-_]|$)/.exec(value);
  return (match?.[1] as ConceptId | undefined) ?? null;
}
