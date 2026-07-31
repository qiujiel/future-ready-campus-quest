import {
  controlConfirmation,
  normalizeTeacherControl,
  TeacherControlBoundaryError,
} from "../functions/_shared/teacher-controls-core";

const cohortId = "d3000000-0000-4000-8000-000000000001";

it("caps a single class-wide phase extension at five minutes", () => {
  expect(
    normalizeTeacherControl({
      action: "extend-phase",
      cohortId,
      phase: "final",
      seconds: 300,
    }),
  ).toMatchObject({ seconds: 300 });
  expect(() =>
    normalizeTeacherControl({
      action: "extend-phase",
      cohortId,
      phase: "final",
      seconds: 301,
    }),
  ).toThrow(
    new TeacherControlBoundaryError("CONTROL_LIMIT_EXCEEDED", 400),
  );
});

it("requires named confirmation for destructive and class-wide changes", () => {
  expect(
    controlConfirmation({
      action: "set-quest-starts",
      cohortId,
      allowed: false,
    }),
  ).toEqual({
    title: "Confirm pause new quest starts",
    consequence: "Students who have not started will be held at entry.",
  });
  expect(
    controlConfirmation({ action: "close-session", cohortId }),
  ).toEqual({
    title: "Confirm close class session",
    consequence: "Joining and new quest starts will close for this cohort.",
  });
});
