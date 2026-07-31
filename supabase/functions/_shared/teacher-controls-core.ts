import type {
  TeacherControlCommand,
} from "../../../src/shared/api/contracts.ts";

export class TeacherControlBoundaryError extends Error {
  constructor(
    public readonly code:
      | "CONTROL_LIMIT_EXCEEDED"
      | "CONTROL_NOT_AVAILABLE",
    public readonly status: 400 | 404,
  ) {
    super(code);
    this.name = "TeacherControlBoundaryError";
  }
}

export function normalizeTeacherControl(
  command: TeacherControlCommand,
): TeacherControlCommand {
  if (
    command.action === "extend-phase" &&
    (!Number.isInteger(command.seconds) ||
      command.seconds < 1 ||
      command.seconds > 300)
  ) {
    throw new TeacherControlBoundaryError(
      "CONTROL_LIMIT_EXCEEDED",
      400,
    );
  }
  if (!command.cohortId) {
    throw new TeacherControlBoundaryError("CONTROL_NOT_AVAILABLE", 404);
  }
  return command;
}

export function controlConfirmation(
  command: TeacherControlCommand,
): { title: string; consequence: string } {
  if (
    command.action === "set-quest-starts" &&
    !command.allowed
  ) {
    return {
      title: "Confirm pause new quest starts",
      consequence: "Students who have not started will be held at entry.",
    };
  }
  if (command.action === "close-session") {
    return {
      title: "Confirm close class session",
      consequence: "Joining and new quest starts will close for this cohort.",
    };
  }
  if (command.action === "extend-phase") {
    return {
      title: `Confirm ${command.phase} phase extension`,
      consequence: `Every active ${command.phase} deadline will move by ${command.seconds} seconds.`,
    };
  }
  return {
    title: `Confirm ${command.action.replaceAll("-", " ")}`,
    consequence: "This teacher action will be recorded in the cohort audit.",
  };
}
