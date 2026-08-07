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
  if (
    (
      command.action === "move-student" ||
      command.action === "remove-student" ||
      command.action === "reset-student" ||
      command.action === "issue-recovery"
    ) && !command.studentId
  ) {
    throw new TeacherControlBoundaryError("CONTROL_NOT_AVAILABLE", 404);
  }
  if (
    (
      command.action === "move-student" ||
      command.action === "set-group-join" ||
      command.action === "transfer-editor" ||
      command.action === "set-group-lock"
    ) && !command.groupId
  ) {
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
  if (command.action === "remove-student") {
    return {
      title: "Confirm remove student",
      consequence:
        "The student will lose cohort access immediately; their learning history remains available to the teacher.",
    };
  }
  if (command.action === "reset-student") {
    return {
      title: "Confirm reset student activity",
      consequence:
        "The active attempt will close and the student can start again; previous evidence is retained.",
    };
  }
  return {
    title: `Confirm ${command.action.replaceAll("-", " ")}`,
    consequence: "This teacher action will be recorded in the cohort audit.",
  };
}
