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

  expect(
    controlConfirmation({
      action: "remove-student",
      cohortId,
      studentId: "d2000000-0000-4000-8000-000000000001",
    }),
  ).toEqual({
    title: "Confirm remove student",
    consequence:
      "The student will lose cohort access immediately; their learning history remains available to the teacher.",
  });

  expect(
    controlConfirmation({
      action: "reset-student",
      cohortId,
      studentId: "d2000000-0000-4000-8000-000000000001",
    }),
  ).toEqual({
    title: "Confirm reset student activity",
    consequence:
      "The active attempt will close and the student can start again; previous evidence is retained.",
  });
});

it("rejects incomplete roster commands at the trusted boundary", () => {
  expect(() =>
    normalizeTeacherControl({
      action: "move-student",
      cohortId,
      studentId: "",
      groupId: "d6000000-0000-4000-8000-000000000002",
    }),
  ).toThrow(new TeacherControlBoundaryError("CONTROL_NOT_AVAILABLE", 404));

  expect(() =>
    normalizeTeacherControl({
      action: "set-group-join",
      cohortId,
      groupId: "",
      enabled: false,
    }),
  ).toThrow(new TeacherControlBoundaryError("CONTROL_NOT_AVAILABLE", 404));
});
