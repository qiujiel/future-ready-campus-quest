export function MisconceptionPanel({
  conceptId,
  tags,
}: {
  conceptId: string;
  tags: Array<{ tag: string; count: number }>;
}) {
  return (
    <aside className="misconception-panel" aria-label={`${conceptId} misconception distribution`}>
      <h3>{conceptId} patterns</h3>
      {tags.length ? (
        <ul>
          {tags.map((entry) => (
            <li key={entry.tag}>{entry.tag}: {entry.count}</li>
          ))}
        </ul>
      ) : (
        <p>No tagged misconceptions yet.</p>
      )}
      <p>
        Next step: revisit the concept purpose, then ask learners to explain
        why their chosen approach fits the scenario.
      </p>
    </aside>
  );
}
