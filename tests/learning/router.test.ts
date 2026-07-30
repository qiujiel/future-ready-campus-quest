import type {
  ConceptId,
  LearningPhase,
  SupportState,
} from "../../src/shared/api/contracts";
import {
  buildAdaptiveRoute,
  phaseAtServerElapsed,
  resolveCurrentPhase,
  supportFor,
} from "../../src/learning/domain/router";

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

function supportMap(state: SupportState): Record<ConceptId, SupportState> {
  return Object.fromEntries(
    conceptIds.map((conceptId) => [conceptId, state]),
  ) as Record<ConceptId, SupportState>;
}

describe("quest phase timing", () => {
  it.each([
    { elapsed: 0, expected: "briefing" },
    { elapsed: 119, expected: "briefing" },
    { elapsed: 120, expected: "diagnostic" },
    { elapsed: 419, expected: "diagnostic" },
    { elapsed: 420, expected: "mission" },
    { elapsed: 1_259, expected: "mission" },
    { elapsed: 1_260, expected: "final" },
    { elapsed: 1_619, expected: "final" },
    { elapsed: 1_620, expected: "retry" },
    { elapsed: 1_799, expected: "retry" },
    { elapsed: 1_800, expected: "complete" },
  ] as const)(
    "maps server elapsed second $elapsed to $expected",
    ({ elapsed, expected }) => {
      expect(phaseAtServerElapsed(elapsed)).toBe(expected);
    },
  );

  it("never lets a local clock regress the server-recorded phase", () => {
    expect(
      resolveCurrentPhase({
        serverRecordedPhase: "final",
        serverElapsedSeconds: 300,
      }),
    ).toBe("final");
  });
});

describe("adaptive support profiles", () => {
  it.each([
    {
      state: "needs_support",
      expected: { hintLevel: 2, scenarioComplexity: 1, itemCount: 2 },
    },
    {
      state: "developing",
      expected: { hintLevel: 1, scenarioComplexity: 2, itemCount: 1 },
    },
    {
      state: "secure",
      expected: { hintLevel: 0, scenarioComplexity: 3, itemCount: 1 },
    },
  ] as const)("maps $state to its support profile", ({ state, expected }) => {
    expect(supportFor(state)).toEqual(expected);
  });
});

describe("deterministic adaptive route", () => {
  it.each(["needs_support", "developing", "secure"] as const)(
    "covers C1-C8 in diagnostic and final for %s learners",
    (state) => {
      const route = buildAdaptiveRoute({
        attemptId: "00000000-0000-4000-8000-000000000001",
        supportByConcept: supportMap(state),
        remainingMissionSeconds: 840,
      });

      expect(new Set(route.diagnostic)).toEqual(new Set(conceptIds));
      expect(new Set(route.final)).toEqual(new Set(conceptIds));
      expect(route.diagnostic).toHaveLength(8);
      expect(route.final).toHaveLength(8);
    },
  );

  it("uses six mission slots without requiring all eight concepts in missions", () => {
    const supportByConcept = supportMap("developing");
    supportByConcept.C2 = "needs_support";
    supportByConcept.C7 = "needs_support";
    supportByConcept.C4 = "secure";

    const route = buildAdaptiveRoute({
      attemptId: "00000000-0000-4000-8000-000000000002",
      supportByConcept,
      remainingMissionSeconds: 840,
    });

    expect(route.missions).toHaveLength(6);
    expect(route.missions.filter(({ kind }) => kind === "weak-practice")).toHaveLength(
      2,
    );
    expect(route.missions.some(({ kind }) => kind === "synthesis")).toBe(true);
    expect(
      route.missions
        .filter(({ kind }) => kind === "weak-practice")
        .flatMap(({ conceptIds: missionConcepts }) => missionConcepts),
    ).toEqual(expect.arrayContaining(["C2", "C7"]));
  });

  it("is stable for retries and changes ordering for a different attempt", () => {
    const input = {
      attemptId: "00000000-0000-4000-8000-000000000003",
      supportByConcept: supportMap("developing"),
      remainingMissionSeconds: 840,
    };

    expect(buildAdaptiveRoute(input)).toEqual(buildAdaptiveRoute(input));
    expect(
      buildAdaptiveRoute({
        ...input,
        attemptId: "00000000-0000-4000-8000-000000000004",
      }).diagnostic,
    ).not.toEqual(buildAdaptiveRoute(input).diagnostic);
  });

  it("drops optional transfer work before weak practice and synthesis", () => {
    const route = buildAdaptiveRoute({
      attemptId: "00000000-0000-4000-8000-000000000005",
      supportByConcept: supportMap("needs_support"),
      remainingMissionSeconds: 420,
    });

    expect(route.missions.map(({ kind }) => kind)).toEqual([
      "weak-practice",
      "weak-practice",
      "synthesis",
    ]);
  });

  it("marks every mission with the support profile of its primary concept", () => {
    const supportByConcept = supportMap("developing");
    supportByConcept.C1 = "needs_support";
    supportByConcept.C3 = "secure";

    const route = buildAdaptiveRoute({
      attemptId: "00000000-0000-4000-8000-000000000006",
      supportByConcept,
      remainingMissionSeconds: 840,
    });

    for (const mission of route.missions) {
      expect(mission.support).toEqual(
        supportFor(supportByConcept[mission.conceptIds[0] as ConceptId]),
      );
    }
  });
});

it("accepts only learning phases as server-recorded resume values", () => {
  const phase: LearningPhase = "reflection";
  expect(
    resolveCurrentPhase({
      serverRecordedPhase: phase,
      serverElapsedSeconds: 1_620,
    }),
  ).toBe("reflection");
});
