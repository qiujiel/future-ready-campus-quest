import type {
  ConceptId,
  LearningPhase,
  SupportState,
} from "../../shared/api/contracts";

export type QuestStage = "briefing" | LearningPhase | "complete";

export interface SupportProfile {
  hintLevel: 0 | 1 | 2;
  scenarioComplexity: 1 | 2 | 3;
  itemCount: 1 | 2;
}

export type MissionKind =
  | "weak-practice"
  | "cross-concept"
  | "secure-transfer"
  | "synthesis";

export interface MissionAssignment {
  kind: MissionKind;
  conceptIds: ConceptId[];
  support: SupportProfile;
}

export interface AdaptiveRoute {
  diagnostic: ConceptId[];
  missions: MissionAssignment[];
  final: ConceptId[];
}

export interface BuildAdaptiveRouteInput {
  attemptId: string;
  supportByConcept: Record<ConceptId, SupportState>;
  remainingMissionSeconds: number;
}

const conceptIds: ConceptId[] = [
  "C1",
  "C2",
  "C3",
  "C4",
  "C5",
  "C6",
  "C7",
  "C8",
];

const stageOrder: QuestStage[] = [
  "briefing",
  "diagnostic",
  "mission",
  "final",
  "retry",
  "reflection",
  "complete",
];

const supportPriority: Record<SupportState, number> = {
  needs_support: 0,
  developing: 1,
  secure: 2,
};

export function phaseAtServerElapsed(
  serverElapsedSeconds: number,
): QuestStage {
  if (!Number.isFinite(serverElapsedSeconds) || serverElapsedSeconds < 0) {
    throw new Error("Server elapsed time must be a non-negative number.");
  }
  if (serverElapsedSeconds < 120) return "briefing";
  if (serverElapsedSeconds < 420) return "diagnostic";
  if (serverElapsedSeconds < 1_260) return "mission";
  if (serverElapsedSeconds < 1_620) return "final";
  if (serverElapsedSeconds < 1_800) return "retry";
  return "complete";
}

export function resolveCurrentPhase({
  serverRecordedPhase,
  serverElapsedSeconds,
}: {
  serverRecordedPhase: LearningPhase;
  serverElapsedSeconds: number;
}): QuestStage {
  const elapsedPhase = phaseAtServerElapsed(serverElapsedSeconds);
  return stageOrder.indexOf(serverRecordedPhase) >
    stageOrder.indexOf(elapsedPhase)
    ? serverRecordedPhase
    : elapsedPhase;
}

export function supportFor(state: SupportState): SupportProfile {
  if (state === "needs_support") {
    return { hintLevel: 2, scenarioComplexity: 1, itemCount: 2 };
  }
  if (state === "developing") {
    return { hintLevel: 1, scenarioComplexity: 2, itemCount: 1 };
  }
  return { hintLevel: 0, scenarioComplexity: 3, itemCount: 1 };
}

function hashSeed(value: string): number {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function randomFrom(seed: number): () => number {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function seededShuffle<T>(values: readonly T[], seed: string): T[] {
  const shuffled = [...values];
  const random = randomFrom(hashSeed(seed));
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [
      shuffled[target] as T,
      shuffled[index] as T,
    ];
  }
  return shuffled;
}

function keepMissionIndexes(slotCount: number): number[] {
  if (slotCount <= 0) return [];
  if (slotCount === 1) return [0];
  if (slotCount === 2) return [0, 5];
  if (slotCount === 3) return [0, 1, 5];
  if (slotCount === 4) return [0, 1, 2, 5];
  if (slotCount === 5) return [0, 1, 2, 3, 5];
  return [0, 1, 2, 3, 4, 5];
}

export function buildAdaptiveRoute({
  attemptId,
  supportByConcept,
  remainingMissionSeconds,
}: BuildAdaptiveRouteInput): AdaptiveRoute {
  if (!attemptId.trim()) throw new Error("Attempt ID is required.");
  if (
    !Number.isFinite(remainingMissionSeconds) ||
    remainingMissionSeconds < 0
  ) {
    throw new Error("Remaining mission time must be non-negative.");
  }

  const diagnostic = seededShuffle(conceptIds, `${attemptId}:diagnostic`);
  const final = seededShuffle(conceptIds, `${attemptId}:final`);
  const priorityConcepts = seededShuffle(
    conceptIds,
    `${attemptId}:priority`,
  ).sort(
    (left, right) =>
      supportPriority[supportByConcept[left]] -
      supportPriority[supportByConcept[right]],
  );
  const secureConcepts = seededShuffle(
    conceptIds.filter(
      (conceptId) => supportByConcept[conceptId] === "secure",
    ),
    `${attemptId}:secure`,
  );
  const transferConcept =
    secureConcepts[0] ?? priorityConcepts.at(-1) ?? "C1";

  const missionSpecs: Array<{
    kind: MissionKind;
    conceptIds: ConceptId[];
  }> = [
    {
      kind: "weak-practice",
      conceptIds: [priorityConcepts[0] ?? "C1"],
    },
    {
      kind: "weak-practice",
      conceptIds: [priorityConcepts[1] ?? "C2"],
    },
    { kind: "cross-concept", conceptIds: ["C1", "C4"] },
    { kind: "cross-concept", conceptIds: ["C5", "C8"] },
    { kind: "secure-transfer", conceptIds: [transferConcept] },
    { kind: "synthesis", conceptIds: ["C3", "C5", "C6"] },
  ];
  const slotCount = Math.min(6, Math.floor(remainingMissionSeconds / 140));
  const missions = keepMissionIndexes(slotCount).map((index) => {
    const spec = missionSpecs[index] as (typeof missionSpecs)[number];
    const primaryConcept = spec.conceptIds[0] as ConceptId;
    return {
      ...spec,
      support: supportFor(supportByConcept[primaryConcept]),
    };
  });

  return { diagnostic, missions, final };
}
