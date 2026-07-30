import {
  classifyConcept,
  estimateMastery,
} from "../../src/learning/domain/mastery";

describe("classifyConcept", () => {
  it("treats missing evidence as needing support", () => {
    expect(classifyConcept({ correct: 0, total: 0 })).toBe("needs_support");
  });

  it.each([
    { correct: 0, total: 1, expected: "needs_support" },
    { correct: 1, total: 3, expected: "needs_support" },
    { correct: 1, total: 2, expected: "developing" },
    { correct: 79, total: 100, expected: "developing" },
    { correct: 4, total: 5, expected: "secure" },
    { correct: 2, total: 2, expected: "secure" },
  ] as const)(
    "classifies $correct/$total as $expected",
    ({ correct, total, expected }) => {
      expect(classifyConcept({ correct, total })).toBe(expected);
    },
  );

  it("rejects impossible evidence counts", () => {
    expect(() => classifyConcept({ correct: 2, total: 1 })).toThrow(
      /correct responses cannot exceed total responses/i,
    );
  });
});

describe("estimateMastery", () => {
  it("weights final evidence more strongly than earlier evidence", () => {
    const finalCorrect = estimateMastery({
      diagnostic: { correct: 0, total: 1 },
      mission: { correct: 0, total: 1 },
      final: { correct: 1, total: 1 },
    });
    const diagnosticCorrect = estimateMastery({
      diagnostic: { correct: 1, total: 1 },
      mission: { correct: 0, total: 1 },
      final: { correct: 0, total: 1 },
    });

    expect(finalCorrect.value).toBe(50);
    expect(diagnosticCorrect.value).toBe(17);
    expect(finalCorrect.state).toBe("developing");
    expect(diagnosticCorrect.state).toBe("needs_support");
  });

  it("keeps retry evidence separate from the scored estimate", () => {
    expect(
      estimateMastery({
        diagnostic: { correct: 0, total: 1 },
        mission: { correct: 0, total: 1 },
        final: { correct: 0, total: 1 },
        retry: { correct: 1, total: 1 },
      }),
    ).toEqual({
      value: 0,
      state: "needs_support",
      retry: { correct: 1, total: 1 },
    });
  });
});
