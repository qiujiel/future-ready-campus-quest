import { useState } from "react";
import type {
  ClassroomReadinessReport,
  TeacherControlCommand,
} from "../../shared/api/contracts";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { supabaseTeacherControlGateway } from "../../teacher/api/teacherControlGateway";
import type { TeacherControlGateway } from "./SessionControls";

function statusLabel(status: string) {
  if (status === "joined") return "Not started";
  if (status === "started") return "In progress";
  if (status === "incomplete") return "Incomplete";
  return "Submitted";
}

function confirmation(command: TeacherControlCommand | null) {
  if (!command) return { title: "Confirm roster control", consequence: "" };
  switch (command.action) {
    case "set-group-join":
      return {
        title: `Confirm ${command.enabled ? "enable" : "disable"} group joining`,
        consequence: command.enabled
          ? "Students with this group code will be able to join while the class window remains open."
          : "New students will no longer be able to use this group code.",
      };
    case "move-student":
      return {
        title: "Confirm move student",
        consequence: "The student will immediately appear in the selected group.",
      };
    case "remove-student":
      return {
        title: "Confirm remove student",
        consequence:
          "The student will lose cohort access immediately. Their learning history will remain available to you.",
      };
    case "reset-student":
      return {
        title: "Confirm reset student activity",
        consequence:
          "The current attempt will close so the student can start again. Previous evidence is retained.",
      };
    case "issue-recovery":
      return {
        title: "Confirm issue recovery",
        consequence:
          "A short-lived, single-use recovery link will be created for this student only.",
      };
    default:
      return {
        title: "Confirm roster control",
        consequence: "This action will be recorded in the cohort audit.",
      };
  }
}

export function ClassroomReadiness({
  report,
  controlGateway = supabaseTeacherControlGateway,
  onChanged,
}: {
  report: ClassroomReadinessReport;
  controlGateway?: TeacherControlGateway;
  onChanged?: () => void | Promise<void>;
}) {
  const [pending, setPending] = useState<TeacherControlCommand | null>(null);
  const [moveTargets, setMoveTargets] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [recoveryUrl, setRecoveryUrl] = useState<string | null>(null);
  const prompt = confirmation(pending);

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setRecoveryUrl(null);
    try {
      const receipt = await controlGateway.execute(pending);
      setStatus("Teacher control applied and recorded.");
      if (receipt.recoveryUrl) setRecoveryUrl(receipt.recoveryUrl);
      setPending(null);
      await onChanged?.();
    } catch {
      setStatus("The control was not applied. Refresh the roster and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="teacher-panel" aria-labelledby="classroom-readiness">
      <p className="eyebrow">Before students begin</p>
      <h2 id="classroom-readiness">Classroom readiness</h2>
      <p>{report.joined} of {report.expected} students joined.</p>
      <dl className="teacher-metrics">
        <div><dt>Active</dt><dd>{report.active}</dd></div>
        <div><dt>Started</dt><dd>{report.started}</dd></div>
        <div><dt>Submitted</dt><dd>{report.submitted}</dd></div>
        <div><dt>Incomplete</dt><dd>{report.incomplete}</dd></div>
        <div><dt>Errors</dt><dd>{report.errors}</dd></div>
      </dl>
      <p>
        Joining is <strong>{report.joining.open ? "open" : "closed"}</strong>.
        {report.joining.open
          ? <> <a href={report.joining.studentUrl}>Student application</a></>
          : null}
      </p>
      <div className="teacher-table-scroll">
        <table>
          <caption>Students assigned to each group</caption>
          <thead>
            <tr>
              <th>Group</th><th>Code</th><th>Student</th><th>Joined</th>
              <th>Last active</th><th>Status</th><th>Internal ID</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {report.groups.flatMap((group) =>
              group.students.length
                ? group.students.map((student, studentIndex) => (
                  <tr key={student.studentId}>
                    <th scope="row">Group {group.groupNumber}</th>
                    <td>
                      {group.joinCode ?? "Closed"}{" "}
                      {report.joining.open && studentIndex === 0 ? (
                        <Button
                          variant="secondary"
                          onClick={() => setPending({
                            action: "set-group-join",
                            cohortId: report.cohortId,
                            groupId: group.groupId,
                            enabled: !group.joinEnabled,
                          })}
                          aria-label={`${group.joinEnabled ? "Disable" : "Enable"} joining for Group ${group.groupNumber}`}
                        >
                          {group.joinEnabled ? "Disable code" : "Enable code"}
                        </Button>
                      ) : null}
                    </td>
                    <td>{student.displayName}</td>
                    <td>
                      <time dateTime={student.joinedAt}>
                        {new Date(student.joinedAt).toLocaleTimeString()}
                      </time>
                    </td>
                    <td>
                      {student.lastActiveAt
                        ? <time dateTime={student.lastActiveAt}>{new Date(student.lastActiveAt).toLocaleTimeString()}</time>
                        : "No activity"}
                    </td>
                    <td>{statusLabel(student.activityStatus)}</td>
                    <td><code>{student.studentId}</code></td>
                    <td>
                      {student.activityStatus === "joined" ? (
                        <>
                          <label>
                            Move {student.displayName} to
                            <select
                              value={moveTargets[student.studentId] ?? ""}
                              onChange={(event) => setMoveTargets((current) => ({
                                ...current,
                                [student.studentId]: event.target.value,
                              }))}
                            >
                              <option value="">Choose group</option>
                              {report.groups
                                .filter((candidate) => candidate.groupId !== group.groupId)
                                .map((candidate) => (
                                  <option key={candidate.groupId} value={candidate.groupId}>
                                    Group {candidate.groupNumber}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <Button
                            variant="secondary"
                            disabled={!moveTargets[student.studentId]}
                            aria-label={`Move ${student.displayName}`}
                            onClick={() => setPending({
                              action: "move-student",
                              cohortId: report.cohortId,
                              studentId: student.studentId,
                              groupId: moveTargets[student.studentId] ?? "",
                            })}
                          >Move</Button>
                        </>
                      ) : null}
                      <Button
                        variant="secondary"
                        aria-label={`Reset ${student.displayName}`}
                        onClick={() => setPending({
                          action: "reset-student",
                          cohortId: report.cohortId,
                          studentId: student.studentId,
                        })}
                      >Reset</Button>
                      <Button
                        variant="secondary"
                        aria-label={`Issue recovery for ${student.displayName}`}
                        onClick={() => setPending({
                          action: "issue-recovery",
                          cohortId: report.cohortId,
                          studentId: student.studentId,
                        })}
                      >Recovery</Button>
                      <Button
                        variant="danger"
                        aria-label={`Remove ${student.displayName}`}
                        onClick={() => setPending({
                          action: "remove-student",
                          cohortId: report.cohortId,
                          studentId: student.studentId,
                        })}
                      >Remove</Button>
                    </td>
                  </tr>
                ))
                : [(
                  <tr key={group.groupId}>
                    <th scope="row">Group {group.groupNumber}</th>
                    <td>
                      {group.joinCode ?? "Closed"}{" "}
                      {report.joining.open ? (
                        <Button
                          variant="secondary"
                          onClick={() => setPending({
                            action: "set-group-join",
                            cohortId: report.cohortId,
                            groupId: group.groupId,
                            enabled: !group.joinEnabled,
                          })}
                          aria-label={`${group.joinEnabled ? "Disable" : "Enable"} joining for Group ${group.groupNumber}`}
                        >
                          {group.joinEnabled ? "Disable code" : "Enable code"}
                        </Button>
                      ) : null}
                    </td>
                    <td colSpan={6}>No students joined</td>
                  </tr>
                )],
            )}
          </tbody>
        </table>
      </div>
      <p role="status" aria-live="polite">{status}</p>
      {recoveryUrl ? (
        <p><a href={recoveryUrl}>Student recovery link</a></p>
      ) : null}
      <Dialog
        open={pending !== null}
        title={prompt.title}
        onClose={() => setPending(null)}
      >
        <p>{prompt.consequence}</p>
        <Button busy={busy} onClick={confirm}>{prompt.title}</Button>
      </Dialog>
    </section>
  );
}
