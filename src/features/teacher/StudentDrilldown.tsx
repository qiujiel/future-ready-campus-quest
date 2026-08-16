import type {
  SupportState,
  TeacherStudentDetail,
} from "../../shared/api/contracts";
import { formatConceptLabel } from "../../learning/domain/concepts";

function readable(state: SupportState | "no_evidence") {
  return state.replace("_", " ");
}

export function StudentDrilldown({
  student,
}: {
  student: TeacherStudentDetail;
}) {
  return (
    <section className="teacher-panel teacher-private" aria-labelledby={`student-${student.studentId}`}>
      <p className="eyebrow">Teacher-only · private evidence</p>
      <h2 id={`student-${student.studentId}`}>
        Private student evidence — {student.realName}
      </h2>
      <p>{student.nickname} · {student.groupName}</p>
      <ul className="student-concepts">
        {student.concepts.map((concept) => (
          <li key={concept.conceptId}>
            <strong>{formatConceptLabel(concept.conceptId)}</strong>
            <span>First: {readable(concept.first)}</span>
            <span>Final: {readable(concept.final)}</span>
            <span>Retry: {concept.retry}</span>
          </li>
        ))}
      </ul>
      <h3>Question outcomes</h3>
      <ul>
        {student.outcomes.map((outcome) => (
          <li key={outcome.itemLabel}>
            {outcome.itemLabel}: {outcome.correct ? "correct" : "needs follow-up"}
            {outcome.misconceptionTag ? ` · ${outcome.misconceptionTag}` : ""}
          </li>
        ))}
      </ul>
      <h3>Private reflection</h3>
      <p>{student.reflection ?? "No reflection submitted."}</p>
    </section>
  );
}
