import { Card } from "../../ui/Card";

export interface TeamResult {
  completionStatus: "complete" | "awaiting";
  groupId: string;
  groupImageUrl?: string;
  groupName: string;
  score: number | null;
}

function rankedTeams(teams: TeamResult[]) {
  const sorted = [...teams].sort((left, right) => {
    if (left.score === null) return 1;
    if (right.score === null) return -1;
    return right.score - left.score;
  });

  return sorted.map((team, index) => {
    const previous = sorted[index - 1];
    const rank =
      team.score === null
        ? null
        : previous?.score === team.score
          ? sorted
              .slice(0, index)
              .findLastIndex((candidate) => candidate.score !== team.score) + 2
          : index + 1;
    return { ...team, rank };
  });
}

export function TeamLeaderboard({ teams }: { teams: TeamResult[] }) {
  const ranked = rankedTeams(teams);

  return (
    <Card
      className="team-leaderboard"
      eyebrow="Team results only"
      title="Campus team board"
    >
      <p>
        Team score combines <strong>60% mastery</strong>,{" "}
        <strong>25% improvement</strong>,{" "}
        <strong>10% mission completion</strong>, and{" "}
        <strong>5% reflection</strong>. Speed is not part of the score.
      </p>
      {ranked.length ? (
        <div className="leaderboard-scroll">
          <table className="leaderboard-table">
            <caption className="sr-only">
              Team ranks, scores, and completion status
            </caption>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Team</th>
                <th scope="col">Team score</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((team) => (
                <tr key={team.groupId}>
                  <td>{team.rank ? `Rank ${team.rank}` : "—"}</td>
                  <th scope="row">
                    {team.groupImageUrl ? (
                      <img src={team.groupImageUrl} alt="" />
                    ) : (
                      <span className="leaderboard-avatar" aria-hidden="true">
                        {team.groupName.slice(0, 1)}
                      </span>
                    )}
                    {team.groupName}
                  </th>
                  <td>{team.score ?? "—"}</td>
                  <td>
                    {team.completionStatus === "complete"
                      ? "Complete"
                      : "Awaiting completion"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="leaderboard-empty">
          Team results will appear after the first group completes the quest.
        </p>
      )}
    </Card>
  );
}
