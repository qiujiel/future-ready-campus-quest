import { emptyDashboardLabel } from "../../teacher/domain/dashboard";

export function CohortOverview({
  enrolled,
  active,
  completed,
}: {
  enrolled: number;
  active: number;
  completed: number;
}) {
  return (
    <section className="teacher-overview" aria-labelledby="cohort-overview">
      <div>
        <p className="eyebrow">Live cohort</p>
        <h2 id="cohort-overview">Class progress</h2>
        <p>{emptyDashboardLabel({ enrolled, active, completed })}</p>
      </div>
      <dl className="teacher-metrics">
        <div>
          <dt>Enrolled</dt>
          <dd>{enrolled}</dd>
        </div>
        <div>
          <dt>Active</dt>
          <dd>{active}</dd>
        </div>
        <div>
          <dt>Completed</dt>
          <dd>{completed}</dd>
        </div>
      </dl>
    </section>
  );
}
