import {
  normalizedImprovement,
  rankTeamScores,
  teamScore,
} from "../../src/learning/domain/scoring";

describe("teamScore", () => {
  it("uses the approved 60/25/10/5 formula", () => {
    expect(
      teamScore({
        finalMastery: 80,
        improvement: 60,
        missionCompletion: 100,
        reflection: 100,
      }),
    ).toBe(78);
  });

  it("bounds every component before rounding the result", () => {
    expect(
      teamScore({
        finalMastery: 120,
        improvement: -20,
        missionCompletion: 105,
        reflection: 200,
      }),
    ).toBe(75);
  });

  it("reports incomplete evidence instead of silently assigning zero", () => {
    expect(
      teamScore({
        finalMastery: 80,
        improvement: 60,
        missionCompletion: null,
        reflection: 100,
      }),
    ).toBeNull();
  });

  it("does not use duration as a scoring input", () => {
    const fast = {
      finalMastery: 80,
      improvement: 60,
      missionCompletion: 100,
      reflection: 100,
      durationSeconds: 600,
    };
    const steady = { ...fast, durationSeconds: 1_800 };

    expect(teamScore(fast)).toBe(teamScore(steady));
  });

  it("limits reflection completion to five contribution points", () => {
    const withoutReflection = teamScore({
      finalMastery: 80,
      improvement: 60,
      missionCompletion: 100,
      reflection: 0,
    });
    const withReflection = teamScore({
      finalMastery: 80,
      improvement: 60,
      missionCompletion: 100,
      reflection: 100,
    });

    expect(withReflection! - withoutReflection!).toBe(5);
  });
});

describe("normalizedImprovement", () => {
  it("normalizes gain against the learner's available improvement", () => {
    expect(
      normalizedImprovement({
        diagnosticCorrect: 2,
        finalCorrect: 5,
        conceptCount: 8,
      }),
    ).toBe(50);
  });

  it("gives a perfect baseline full improvement credit only when retained", () => {
    expect(
      normalizedImprovement({
        diagnosticCorrect: 8,
        finalCorrect: 8,
        conceptCount: 8,
      }),
    ).toBe(100);
    expect(
      normalizedImprovement({
        diagnosticCorrect: 8,
        finalCorrect: 7,
        conceptCount: 8,
      }),
    ).toBe(0);
  });

  it("never rewards regression", () => {
    expect(
      normalizedImprovement({
        diagnosticCorrect: 6,
        finalCorrect: 4,
        conceptCount: 8,
      }),
    ).toBe(0);
  });
});

describe("rankTeamScores", () => {
  it("shares ranks for ties and uses group number only for stable ordering", () => {
    expect(
      rankTeamScores([
        { groupId: "group-3", groupNumber: 3, score: 82 },
        { groupId: "group-2", groupNumber: 2, score: 91 },
        { groupId: "group-1", groupNumber: 1, score: 91 },
      ]),
    ).toEqual([
      { groupId: "group-1", groupNumber: 1, score: 91, rank: 1 },
      { groupId: "group-2", groupNumber: 2, score: 91, rank: 1 },
      { groupId: "group-3", groupNumber: 3, score: 82, rank: 3 },
    ]);
  });

  it("places incomplete teams in an explicit unranked section", () => {
    expect(
      rankTeamScores([
        { groupId: "group-2", groupNumber: 2, score: null },
        { groupId: "group-1", groupNumber: 1, score: 75 },
        { groupId: "group-3", groupNumber: 3, score: null },
      ]),
    ).toEqual([
      { groupId: "group-1", groupNumber: 1, score: 75, rank: 1 },
      { groupId: "group-2", groupNumber: 2, score: null, rank: null },
      { groupId: "group-3", groupNumber: 3, score: null, rank: null },
    ]);
  });

  it("returns only group aggregates, never private member results", () => {
    const ranked = rankTeamScores([
      { groupId: "group-1", groupNumber: 1, score: 88 },
    ]);

    expect(ranked[0]).toEqual({
      groupId: "group-1",
      groupNumber: 1,
      score: 88,
      rank: 1,
    });
    expect(ranked[0]).not.toHaveProperty("members");
    expect(ranked[0]).not.toHaveProperty("individualContributions");
  });
});
