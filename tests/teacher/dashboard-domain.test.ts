import {
  emptyDashboardLabel,
  evidencePercentage,
  heatmapIntensity,
  rankDashboardTeams,
} from "../../src/teacher/domain/dashboard";

describe("teacher dashboard display domain", () => {
  it("keeps no evidence distinct from zero secure evidence", () => {
    expect(
      evidencePercentage({
        needs_support: 0,
        developing: 0,
        secure: 0,
      }),
    ).toBeNull();
    expect(
      evidencePercentage({
        needs_support: 2,
        developing: 1,
        secure: 0,
      }),
    ).toBe(0);
  });

  it("derives stable heatmap intensity from the secure evidence share", () => {
    expect(
      heatmapIntensity({
        needs_support: 0,
        developing: 0,
        secure: 0,
      }),
    ).toBe("none");
    expect(
      heatmapIntensity({
        needs_support: 3,
        developing: 1,
        secure: 1,
      }),
    ).toBe("low");
    expect(
      heatmapIntensity({
        needs_support: 1,
        developing: 1,
        secure: 2,
      }),
    ).toBe("medium");
    expect(
      heatmapIntensity({
        needs_support: 0,
        developing: 1,
        secure: 4,
      }),
    ).toBe("high");
  });

  it("shares ranks for ties and keeps incomplete teams after scored teams", () => {
    expect(
      rankDashboardTeams([
        { groupId: "g3", groupNumber: 3, score: null },
        { groupId: "g2", groupNumber: 2, score: 88 },
        { groupId: "g1", groupNumber: 1, score: 88 },
        { groupId: "g4", groupNumber: 4, score: 72 },
      ]),
    ).toEqual([
      { groupId: "g1", groupNumber: 1, score: 88, rank: 1 },
      { groupId: "g2", groupNumber: 2, score: 88, rank: 1 },
      { groupId: "g4", groupNumber: 4, score: 72, rank: 3 },
      { groupId: "g3", groupNumber: 3, score: null, rank: null },
    ]);
  });

  it("labels genuinely empty, active, and completed cohorts differently", () => {
    expect(
      emptyDashboardLabel({ enrolled: 0, active: 0, completed: 0 }),
    ).toBe("No students have joined this cohort yet.");
    expect(
      emptyDashboardLabel({ enrolled: 12, active: 7, completed: 0 }),
    ).toBe("Learning evidence is arriving.");
    expect(
      emptyDashboardLabel({ enrolled: 12, active: 0, completed: 12 }),
    ).toBe("This cohort has completed the quest.");
  });
});
