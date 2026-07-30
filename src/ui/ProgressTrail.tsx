import { StatusPill } from "./StatusPill";

export type CampusPhase =
  | "briefing"
  | "diagnostic"
  | "mission"
  | "final"
  | "reflection";

const destinations: Array<{
  phase: CampusPhase;
  name: string;
  short: string;
}> = [
  { phase: "briefing", name: "Briefing Plaza", short: "Meet your crew" },
  { phase: "diagnostic", name: "Diagnostic Gate", short: "Show what you know" },
  { phase: "mission", name: "Adaptive Learning Labs", short: "Explore six missions" },
  { phase: "final", name: "Final Challenge Hall", short: "Apply all eight concepts" },
  { phase: "reflection", name: "Reflection Garden", short: "Notice your growth" },
];

export function ProgressTrail({
  completedPhases,
  phase,
}: {
  completedPhases: CampusPhase[];
  phase: CampusPhase;
}) {
  return (
    <ol className="progress-trail" aria-label="Campus Quest route">
      {destinations.map((destination, index) => {
        const state = completedPhases.includes(destination.phase)
          ? "complete"
          : destination.phase === phase
            ? "current"
            : "upcoming";
        return (
          <li key={destination.phase} data-phase-state={state}>
            <span className="progress-trail__marker" aria-hidden="true">
              {state === "complete" ? "✓" : index + 1}
            </span>
            <span>
              <strong>{destination.name}</strong>
              <small>{destination.short}</small>
            </span>
            <StatusPill tone={state}>
              {state === "complete"
                ? "Complete"
                : state === "current"
                  ? "You are here"
                  : "Upcoming"}
            </StatusPill>
          </li>
        );
      })}
    </ol>
  );
}
