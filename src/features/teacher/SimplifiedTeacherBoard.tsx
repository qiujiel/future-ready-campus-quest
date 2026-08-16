import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatConceptLabel } from "../../learning/domain/concepts";
import type {
  ClassroomReadinessReport,
  TeacherConceptFocus,
  TeacherDashboardSummary,
  TeacherQuestionBank,
} from "../../shared/api/contracts";
import type { TeacherGateway } from "../../teacher/api/teacherClient";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { ClassroomReadiness } from "./ClassroomReadiness";
import { ConceptHeatmap } from "./ConceptHeatmap";
import { ExportPanel } from "./ExportPanel";
import { QuestionBank } from "./QuestionBank";
import { SessionControls } from "./SessionControls";

function HelpTip({ label, children }: { label: string; children: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={`teacher-help${open ? " teacher-help--open" : ""}`}>
      <button
        className="teacher-help__trigger"
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        ?
      </button>
      <span className="teacher-help__content" role="tooltip">{children}</span>
    </span>
  );
}

function responseLabel(
  response: TeacherQuestionBank["items"][number]["correctResponse"],
) {
  if (Array.isArray(response)) return response.join(", ");
  return Object.entries(response)
    .map(([prompt, category]) => `${prompt} = ${category}`)
    .join("; ");
}

function MissedQuestionReview({
  bank,
  focus,
  loading,
  scope,
  onClose,
}: {
  bank: TeacherQuestionBank | null;
  focus: TeacherConceptFocus;
  loading: boolean;
  scope: string;
  onClose: () => void;
}) {
  const counts = new Map(
    focus.missedQuestions.map((question) => [question.itemId, question]),
  );
  const items = bank?.items.filter((item) => counts.has(item.itemId)) ?? [];

  return (
    <section className="teacher-review-panel" aria-labelledby="missed-review-title">
      <div className="teacher-review-panel__header">
        <div>
          <p className="eyebrow">{scope}</p>
          <h2 id="missed-review-title">
            Missed questions for {formatConceptLabel(focus.conceptId)}
          </h2>
        </div>
        <Button variant="secondary" onClick={onClose}>Close review</Button>
      </div>
      {loading ? <p role="status">Loading missed questions…</p> : null}
      {!loading && !bank ? (
        <p role="alert">The missed questions could not be loaded. Try again.</p>
      ) : null}
      {!loading && bank && items.length === 0 ? (
        <p>No reviewable missed questions are available yet.</p>
      ) : null}
      {items.length ? (
        <ol className="teacher-review-list">
          {items.map((item) => {
            const count = counts.get(item.itemId);
            const correct = Array.isArray(item.correctResponse)
              ? new Set(item.correctResponse)
              : null;
            return (
              <li key={item.itemId} className="teacher-review-question">
                <p className="eyebrow">
                  {formatConceptLabel(item.conceptId)} · {count?.incorrectResponses ?? 0} incorrect responses
                </p>
                <h3>{item.stem}</h3>
                {"options" in item.interaction ? (
                  <ul className="teacher-review-options">
                    {item.interaction.options.map((option) => (
                      <li
                        key={option.id}
                        className={correct?.has(option.id) ? "is-correct" : ""}
                      >
                        {option.id}. {option.text}
                        {correct?.has(option.id) ? " — Correct" : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div>
                    <p>Categories: {item.interaction.categories.join(", ")}</p>
                    <ul className="teacher-review-options">
                      {item.interaction.prompts.map((prompt) => (
                        <li key={prompt.id}>{prompt.id}. {prompt.text}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p><strong>Correct answer:</strong> {responseLabel(item.correctResponse)}</p>
                <p><strong>Teaching explanation:</strong> {item.rationale}</p>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}

function ClassroomSetup({
  report,
  onChanged,
}: {
  report: ClassroomReadinessReport;
  onChanged: () => void | Promise<void>;
}) {
  return (
    <details className="teacher-panel teacher-secondary-section">
      <summary>Classroom setup and group codes</summary>
      <p>
        Joining is <strong>{report.joining.open ? "open" : "closed"}</strong>.
        {report.joining.open ? <> <a href={report.joining.studentUrl}>Student application</a></> : null}
      </p>
      <div className="teacher-table-scroll">
        <table className="teacher-simple-table">
          <caption>Group codes and students</caption>
          <thead>
            <tr><th>Group</th><th>Code</th><th>Students</th></tr>
          </thead>
          <tbody>
            {report.groups.map((group) => (
              <tr key={group.groupId}>
                <th scope="row">Group {group.groupNumber} · {group.displayName}</th>
                <td>{group.joinCode ?? "Closed"}</td>
                <td>
                  {group.students.length ? (
                    <ul className="teacher-student-links">
                      {group.students.map((student) => (
                        <li key={student.studentId}>
                          <span>{student.displayName}</span>{" "}
                          <a
                            href={`#/teacher/cohorts/${report.cohortId}/students/${student.studentId}`}
                            aria-label={`View ${student.displayName} progress`}
                          >
                            View progress
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : "No students joined"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="teacher-nested-section">
        <summary>Student roster and controls</summary>
        <ClassroomReadiness report={report} onChanged={onChanged} />
      </details>
      <details className="teacher-nested-section">
        <summary>Live session controls</summary>
        <SessionControls
          cohortId={report.cohortId}
          cohortTitle={report.title}
          activeStudents={report.active}
          onChanged={onChanged}
        />
      </details>
    </details>
  );
}

export function SimplifiedTeacherBoard({
  gateway,
  onReadinessChanged,
  readiness,
  summary,
}: {
  gateway: TeacherGateway;
  onReadinessChanged: () => void | Promise<void>;
  readiness: ClassroomReadinessReport | null;
  summary: TeacherDashboardSummary;
}) {
  const navigate = useNavigate();
  const [review, setReview] = useState<{
    focus: TeacherConceptFocus;
    scope: string;
  } | null>(null);
  const [bank, setBank] = useState<TeacherQuestionBank | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeConfirmation, setRemoveConfirmation] = useState("");
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeStatus, setRemoveStatus] = useState("");
  const title = readiness?.title ?? "Current class";
  const teams = summary.teamScores;

  async function openReview(focus: TeacherConceptFocus, scope: string) {
    setReview({ focus, scope });
    if (bank || !gateway.getQuestionBank) return;
    setReviewLoading(true);
    try {
      setBank(await gateway.getQuestionBank(summary.cohortId));
    } catch {
      setBank(null);
    } finally {
      setReviewLoading(false);
    }
  }

  async function removeClass() {
    if (!gateway.removeClass || removeConfirmation !== title) return;
    setRemoveBusy(true);
    setRemoveStatus("");
    try {
      await gateway.removeClass(summary.cohortId, crypto.randomUUID());
      navigate("/teacher/setup", { replace: true });
    } catch {
      setRemoveStatus(
        "The class could not be completely removed. It may already be closed; return to class setup and refresh.",
      );
    } finally {
      setRemoveBusy(false);
    }
  }

  return (
    <>
      <header className="teacher-header teacher-board-header">
        <div>
          <p className="eyebrow">Teacher board</p>
          <h1>{title}</h1>
          <p>{teams.length} teams · {summary.completed} students completed</p>
        </div>
        <Button
          variant="danger"
          disabled={!gateway.removeClass}
          onClick={() => setRemoveOpen(true)}
        >
          Remove class
        </Button>
      </header>

      <section className="teacher-panel teacher-class-focus" aria-labelledby="class-focus-title">
        <div>
          <p className="eyebrow">Class focus</p>
          <h2 id="class-focus-title">
            Most-missed concept{" "}
            <HelpTip label="Explain most-missed concept">
              The concept missed by the largest number of students in this class.
            </HelpTip>
          </h2>
          {summary.classFocus ? (
            <>
              <p className="teacher-class-focus__concept">
                {formatConceptLabel(summary.classFocus.conceptId)}
              </p>
              <p>
                {summary.classFocus.missedStudents} of {summary.classFocus.studentCount} students missed this concept.
              </p>
            </>
          ) : (
            <p>No missed-concept evidence is available yet.</p>
          )}
        </div>
        {summary.classFocus ? (
          <Button onClick={() => void openReview(summary.classFocus!, "Whole class")}>
            Review missed questions
          </Button>
        ) : null}
      </section>

      {review ? (
        <MissedQuestionReview
          bank={bank}
          focus={review.focus}
          loading={reviewLoading}
          scope={review.scope}
          onClose={() => setReview(null)}
        />
      ) : null}

      <section className="teacher-panel" aria-labelledby="team-results-title">
        <p className="eyebrow">At a glance</p>
        <h2 id="team-results-title">Team results</h2>
        <div className="teacher-table-scroll">
          <table className="teacher-simple-table teacher-team-results">
            <caption>Team scores and most-missed concepts</caption>
            <thead>
              <tr>
                <th>Team</th>
                <th>
                  Score{" "}
                  <HelpTip label="Explain team score">
                    The current saved group score, shown after eligible members complete the activity.
                  </HelpTip>
                </th>
                <th>Most missed</th><th>Missed by</th><th>Review</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => (
                <tr key={team.groupId}>
                  <th scope="row">
                    <a href={`#/teacher/cohorts/${summary.cohortId}/groups/${team.groupId}`}>
                      Group {team.groupNumber} · {team.displayName}
                    </a>
                  </th>
                  <td>{team.score ?? "Awaiting completion"}</td>
                  <td>
                    {team.conceptFocus
                      ? formatConceptLabel(team.conceptFocus.conceptId)
                      : "Not enough evidence"}
                  </td>
                  <td>
                    {team.conceptFocus
                      ? `${team.conceptFocus.missedStudents} of ${team.conceptFocus.studentCount}`
                      : "—"}
                  </td>
                  <td>
                    <Button
                      variant="secondary"
                      disabled={!team.conceptFocus}
                      onClick={() => team.conceptFocus
                        ? void openReview(team.conceptFocus, `Group ${team.groupNumber} · ${team.displayName}`)
                        : undefined}
                    >
                      Review
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {readiness ? (
        <ClassroomSetup report={readiness} onChanged={onReadinessChanged} />
      ) : null}

      <details className="teacher-panel teacher-secondary-section">
        <summary>More learning evidence and exports</summary>
        <ConceptHeatmap concepts={summary.conceptAggregates} />
        <QuestionBank cohortId={summary.cohortId} gateway={gateway} />
        <ExportPanel cohortId={summary.cohortId} />
      </details>

      <p role="status" aria-live="polite">{removeStatus}</p>
      <Dialog
        open={removeOpen}
        title={`Remove ${title}?`}
        onClose={() => {
          setRemoveOpen(false);
          setRemoveConfirmation("");
        }}
      >
        <p>
          This closes joining, removes the class from your active list, and anonymizes student names and reflections. Aggregate learning evidence is retained securely.
        </p>
        <label className="teacher-remove-confirmation">
          Type <strong>{title}</strong> to confirm
          <input
            value={removeConfirmation}
            onChange={(event) => setRemoveConfirmation(event.target.value)}
            autoComplete="off"
          />
        </label>
        <Button
          variant="danger"
          busy={removeBusy}
          disabled={removeConfirmation !== title}
          onClick={() => void removeClass()}
        >
          Remove class permanently
        </Button>
      </Dialog>
    </>
  );
}
