import campusMapUrl from "../../assets/campus-map.svg";
import {
  type CampusPhase,
  ProgressTrail,
} from "../../ui/ProgressTrail";

export function CampusMap({
  completedPhases,
  phase,
}: {
  completedPhases: CampusPhase[];
  phase: CampusPhase;
}) {
  return (
    <section className="campus-map" aria-labelledby="campus-route-title">
      <div className="campus-map__heading">
        <div>
          <p className="eyebrow">Your route</p>
          <h2 id="campus-route-title">Future-Ready Campus</h2>
        </div>
        {completedPhases.length > 0 ? (
          <p className="phase-badge" aria-label="Phase badge earned">
            <span aria-hidden="true">✦</span> {completedPhases.length} badge
            {completedPhases.length === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>
      <img
        className="campus-map__art"
        src={campusMapUrl}
        alt="Illustrated route across the five campus destinations"
      />
      <ProgressTrail phase={phase} completedPhases={completedPhases} />
    </section>
  );
}
