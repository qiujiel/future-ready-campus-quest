import { useState } from "react";
import { getSupabaseClient } from "../../shared/api/supabase";
import type { CohortExportType } from "../../shared/api/contracts";
import { Button } from "../../ui/Button";

async function downloadExport(
  cohortId: string,
  exportType: CohortExportType,
) {
  const result = await getSupabaseClient().functions.invoke(
    "export-cohort",
    { body: { cohortId, exportType } },
  );
  if (result.error || typeof result.data !== "string") {
    throw new Error("EXPORT_NOT_AVAILABLE");
  }
  const url = URL.createObjectURL(
    new Blob([result.data], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `cohort-${exportType}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function ExportPanel({ cohortId }: { cohortId: string }) {
  const [status, setStatus] = useState("");

  async function exportType(type: CohortExportType) {
    try {
      await downloadExport(cohortId, type);
      setStatus("Private CSV download prepared.");
    } catch {
      setStatus("The export was not available.");
    }
  }

  return (
    <section className="teacher-panel" aria-labelledby="export-panel">
      <p className="eyebrow">Teacher-requested only</p>
      <h2 id="export-panel">Export cohort evidence</h2>
      <p>
        CSV cells are escaped for spreadsheet formulas and generated without
        persistent public files.
      </p>
      <div className="hero-actions">
        <Button variant="secondary" onClick={() => exportType("summary")}>
          Download aggregate summary
        </Button>
        <Button
          variant="secondary"
          onClick={() => exportType("teacher-private")}
        >
          Download teacher-private report
        </Button>
      </div>
      <p role="status" aria-live="polite">{status}</p>
    </section>
  );
}
