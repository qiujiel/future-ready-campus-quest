import guideUrl from "../assets/quest-guide.svg";

export function QuestGuide({ children }: { children: string }) {
  return (
    <aside className="quest-guide" aria-label="Orbit's guide">
      <img src={guideUrl} alt="" aria-hidden="true" />
      <p>
        <strong>Orbit says:</strong> {children}
      </p>
    </aside>
  );
}
