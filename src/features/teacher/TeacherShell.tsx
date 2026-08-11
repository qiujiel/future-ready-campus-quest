import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type {
  TeacherDashboardSummary,
} from "../../shared/api/contracts";
import {
  supabaseTeacherGateway,
  type TeacherGateway,
} from "../../teacher/api/teacherClient";
import { SimplifiedTeacherBoard } from "./SimplifiedTeacherBoard";
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
  const [readiness, setReadiness] = useState<
    Awaited<ReturnType<NonNullable<TeacherGateway["getReadiness"]>>> | null
  >(null);
  const [error, setError] = useState(false);

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

  useEffect(() => {
    let active = true;
    if (!gateway.getReadiness) return;
    void gateway.getReadiness(cohortId).then(
      (value) => {
        if (active) setReadiness(value);
      },
      () => {
        if (active) setError(true);
      },
    );
    return () => {
      active = false;
    };
  }, [cohortId, gateway]);

  async function refreshReadiness() {
    if (!gateway.getReadiness) return;
    setReadiness(await gateway.getReadiness(cohortId));
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
  if (
    params.groupId &&
    !summary.teamScores.some((team) => team.groupId === params.groupId)
  ) {
    return (
      <main className="teacher-shell">
        <p role="alert">Group evidence is not available.</p>
      </main>
    );
  }

  return (
    <main className="teacher-shell">
      <SimplifiedTeacherBoard
        gateway={gateway}
        summary={{
          ...summary,
          teamScores: params.groupId
            ? summary.teamScores.filter((team) => team.groupId === params.groupId)
            : summary.teamScores,
        }}
        readiness={readiness}
        onReadinessChanged={refreshReadiness}
      />
    </main>
  );
}
