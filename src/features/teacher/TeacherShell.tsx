import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type {
  ConceptId,
  TeacherDashboardSummary,
} from "../../shared/api/contracts";
import {
  supabaseTeacherGateway,
  type TeacherGateway,
} from "../../teacher/api/teacherClient";
import { CohortOverview } from "./CohortOverview";
import { ConceptHeatmap } from "./ConceptHeatmap";
import { GroupDrilldown } from "./GroupDrilldown";
import { MostMissedItems } from "./MostMissedItems";
import { SessionControls } from "./SessionControls";
import { ExportPanel } from "./ExportPanel";
import { StudentDrilldown } from "./StudentDrilldown";

function TeacherStudentRoute({
  cohortId,
  studentId,
  gateway,
}: {
  cohortId: string;
  studentId: string;
  gateway: TeacherGateway;
}) {
  const [student, setStudent] = useState<
    Awaited<ReturnType<NonNullable<TeacherGateway["getStudent"]>>> | null
  >(null);
  const [error, setError] = useState(!gateway.getStudent);
  useEffect(() => {
    let active = true;
    const load = gateway.getStudent;
    if (!load) return;
    void load(cohortId, studentId).then(
      (value) => {
        if (active) setStudent(value);
      },
      () => {
        if (active) setError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [cohortId, gateway, studentId]);
  if (error) return <p role="alert">Student evidence is not available.</p>;
  if (!student) return <p role="status">Loading private student evidence…</p>;
  return <StudentDrilldown student={student} />;
}

export function TeacherShell({
  cohortId: providedCohortId,
  gateway = supabaseTeacherGateway,
}: {
  cohortId?: string;
  gateway?: TeacherGateway;
}) {
  const params = useParams();
  const cohortId = providedCohortId ?? params.cohortId ?? "";
  const [summary, setSummary] = useState<TeacherDashboardSummary | null>(null);
  const [error, setError] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<ConceptId | null>(
    (params.conceptId as ConceptId | undefined) ?? null,
  );

  useEffect(() => {
    let active = true;
    void gateway.getSummary(cohortId).then(
      (value) => {
        if (active) setSummary(value);
      },
      () => {
        if (active) setError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [cohortId, gateway]);

  function selectConcept(conceptId: ConceptId) {
    setSelectedConcept(conceptId);
  }

  if (error) {
    return (
      <main className="teacher-shell">
        <p role="alert">
          This cohort is not available. Return to your teacher workspace.
        </p>
      </main>
    );
  }
  if (!summary) {
    return (
      <main className="teacher-shell">
        <p role="status">Loading private cohort evidence…</p>
      </main>
    );
  }
  if (params.studentId) {
    return (
      <main className="teacher-shell">
        <TeacherStudentRoute
          cohortId={cohortId}
          studentId={params.studentId}
          gateway={gateway}
        />
      </main>
    );
  }
  const visibleTeams = params.groupId
    ? summary.teamScores.filter((team) => team.groupId === params.groupId)
    : summary.teamScores;
  if (params.groupId && visibleTeams.length === 0) {
    return (
      <main className="teacher-shell">
        <p role="alert">Group evidence is not available.</p>
      </main>
    );
  }

  return (
    <main className="teacher-shell">
      <header className="teacher-header">
        <div>
          <p className="eyebrow">Teacher workspace</p>
          <h1>Class learning dashboard</h1>
        </div>
        <p>
          Updated <time dateTime={summary.generatedAt}>{new Date(summary.generatedAt).toLocaleTimeString()}</time>
        </p>
      </header>
      <CohortOverview
        enrolled={summary.enrolled}
        active={summary.active}
        completed={summary.completed}
      />
      <div className="teacher-dashboard-grid">
        <ConceptHeatmap
          concepts={summary.conceptAggregates}
          onSelect={selectConcept}
        />
        <MostMissedItems items={summary.mostMissed} />
      </div>
      <GroupDrilldown
        cohortId={summary.cohortId}
        teams={visibleTeams}
        conceptFilter={selectedConcept ?? undefined}
      />
      <SessionControls
        cohortId={summary.cohortId}
        cohortTitle="Current cohort"
        activeStudents={summary.active}
      />
      <ExportPanel cohortId={summary.cohortId} />
    </main>
  );
}
