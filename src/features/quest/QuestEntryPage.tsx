import { QuestShell } from "./QuestShell";

export function QuestEntryPage() {
  return (
    <QuestShell
      phase="briefing"
      completedPhases={[]}
      visitedConcepts={[]}
    >
      <section className="quest-stage__placeholder">
        <p className="eyebrow">Session ready</p>
        <h2>You are in</h2>
        <p>
          You are in. Your teacher will open the diagnostic when the whole class
          is ready.
        </p>
        <p>
          You can stay on this page. Your place is tied to this private student
          session.
        </p>
      </section>
    </QuestShell>
  );
}
