import { type PropsWithChildren, useState } from "react";
import type { ConceptId } from "../../shared/api/contracts";
import { Button } from "../../ui/Button";
import { QuestGuide } from "../../ui/QuestGuide";
import {
  type CampusPhase,
} from "../../ui/ProgressTrail";
import { MotionProvider } from "../../ui/motion/MotionProvider";
import { CampusMap } from "./CampusMap";

const phaseTitles: Record<CampusPhase, string> = {
  briefing: "Briefing Plaza",
  diagnostic: "Diagnostic Gate",
  mission: "Adaptive Learning Labs",
  final: "Final Challenge Hall",
  reflection: "Reflection Garden",
};

function readAnimationPreference() {
  try {
    return localStorage.getItem("campus-quest-reduce-animation") === "true";
  } catch {
    return false;
  }
}

export function QuestShell({
  children,
  completedPhases,
  lastAcknowledgement,
  phase,
  resumed = false,
  transitionMessage,
  visitedConcepts,
}: PropsWithChildren<{
  completedPhases: CampusPhase[];
  lastAcknowledgement?: string;
  phase: CampusPhase;
  resumed?: boolean;
  transitionMessage?: string;
  visitedConcepts: ConceptId[];
}>) {
  const [reduceAnimation, setReduceAnimation] = useState(readAnimationPreference);

  function toggleAnimation() {
    setReduceAnimation((current) => {
      const next = !current;
      try {
        localStorage.setItem("campus-quest-reduce-animation", String(next));
      } catch {
        // The preference remains usable for the current page.
      }
      return next;
    });
  }

  return (
    <MotionProvider forceReduced={reduceAnimation}>
      <main className="quest-shell">
        <header className="quest-topbar">
          <a className="quest-brand" href="#/quest">
            Campus Quest
          </a>
          <div className="quest-topbar__tools">
            <Button
              variant="quiet"
              aria-pressed={reduceAnimation}
              onClick={toggleAnimation}
            >
              Reduce animation
            </Button>
          </div>
        </header>

        <div className="quest-shell__layout quest-content">
          <CampusMap phase={phase} completedPhases={completedPhases} />
          <section className="quest-stage" aria-labelledby="quest-stage-title">
            <p className="eyebrow">Current destination</p>
            <h1 id="quest-stage-title">{phaseTitles[phase]}</h1>
            <p className="coverage-note">
              <strong>{visitedConcepts.length} of 8 concepts visited.</strong>{" "}
              Your route will cover all eight named concepts.
            </p>
            {resumed ? (
              <p className="resume-note">
                Welcome back. We restored your place from the campus record.
              </p>
            ) : null}
            <QuestGuide>
              {phase === "mission"
                ? "Each lab builds a different idea. Take the route one thoughtful step at a time."
                : "Your progress is saved after each confirmed response."}
            </QuestGuide>
            {children ?? (
              <section className="quest-stage__placeholder">
                <h2>Waiting for your next campus activity</h2>
                <p>Your teacher controls when the class moves forward.</p>
              </section>
            )}
          </section>
        </div>

        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {[transitionMessage, lastAcknowledgement].filter(Boolean).join(" ")}
        </div>
        {reduceAnimation ? (
          <p className="motion-preference-note">Animation reduced</p>
        ) : null}
      </main>
    </MotionProvider>
  );
}
