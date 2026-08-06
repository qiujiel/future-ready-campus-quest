import type { ClassroomReadinessReport } from "../../shared/api/contracts";

function statusLabel(status: string) {
  if (status === "joined") return "Not started";
  if (status === "started") return "In progress";
  if (status === "incomplete") return "Incomplete";
  return "Submitted";
}

export function ClassroomReadiness({ report }: { report: ClassroomReadinessReport }) {
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
      </dl>
      <p>
        Joining is <strong>{report.joining.open ? "open" : "closed"}</strong>.
        {report.joining.open ? <> <a href={report.joining.studentUrl}>Student application</a></> : null}
      </p>
      <div className="teacher-table-scroll">
        <table>
          <caption>Students assigned to each group</caption>
          <thead>
            <tr>
              <th>Group</th><th>Code</th><th>Student</th><th>Joined</th>
              <th>Last active</th><th>Status</th><th>Internal ID</th>
            </tr>
          </thead>
          <tbody>
            {report.groups.flatMap((group) =>
              group.students.length
                ? group.students.map((student) => (
                  <tr key={student.studentId}>
                    <th scope="row">Group {group.groupNumber}</th>
                    <td>{group.joinCode ?? "Closed"}</td>
                    <td>{student.displayName}</td>
                    <td><time dateTime={student.joinedAt}>{new Date(student.joinedAt).toLocaleTimeString()}</time></td>
                    <td>{student.lastActiveAt ? <time dateTime={student.lastActiveAt}>{new Date(student.lastActiveAt).toLocaleTimeString()}</time> : "No activity"}</td>
                    <td>{statusLabel(student.activityStatus)}</td>
                    <td><code>{student.studentId}</code></td>
                  </tr>
                ))
                : [(
                  <tr key={group.groupId}>
                    <th scope="row">Group {group.groupNumber}</th>
                    <td>{group.joinCode ?? "Closed"}</td>
                    <td colSpan={5}>No students joined</td>
                  </tr>
                )],
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
