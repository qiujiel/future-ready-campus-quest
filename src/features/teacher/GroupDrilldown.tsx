import type { TeacherTeamScore } from "../../shared/api/contracts";
import { rankDashboardTeams } from "../../teacher/domain/dashboard";

export function GroupDrilldown({
  cohortId,
  teams,
  conceptFilter,
}: {
  cohortId: string;
  teams: TeacherTeamScore[];
  conceptFilter?: string | undefined;
}) {
  const ranked = rankDashboardTeams(teams);
  return (
    <section className="teacher-panel" aria-labelledby="group-evidence">
      <p className="eyebrow">Teacher-only drill-down</p>
      <h2 id="group-evidence">
        Group evidence{conceptFilter ? ` for ${conceptFilter}` : ""}
      </h2>
      <div className="teacher-team-grid">
        {ranked.map((team) => (
          <article key={team.groupId}>
            <h3>{team.displayName}</h3>
            <p>
              {team.score === null
                ? "Score awaiting completion"
                : `Rank ${team.rank} · team score ${team.score}`}
            </p>
            <p>{team.completedMembers} of {team.enrolledMembers} members completed</p>
            <a
              className="secondary-action"
              href={`#/teacher/cohorts/${cohortId}/groups/${team.groupId}`}
            >
              View {team.displayName}
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
