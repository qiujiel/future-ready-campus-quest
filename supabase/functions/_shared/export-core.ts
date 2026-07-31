import type {
  CohortExportType,
} from "../../../src/shared/api/contracts.ts";

export type { CohortExportType };

export class ExportBoundaryError extends Error {
  constructor(
    public readonly code: "EXPORT_NOT_AVAILABLE",
    public readonly status: 404,
  ) {
    super(code);
    this.name = "ExportBoundaryError";
  }
}

export interface ExportRepository<T = unknown> {
  loadOwnedRows(
    actorUserId: string,
    cohortId: string,
    exportType: CohortExportType,
  ): Promise<T | null>;
}

export async function loadOwnedExport<T>(
  actorUserId: string | null,
  cohortId: string,
  exportType: CohortExportType,
  repository: ExportRepository<T>,
): Promise<T> {
  if (!actorUserId) {
    throw new ExportBoundaryError("EXPORT_NOT_AVAILABLE", 404);
  }
  const rows = await repository.loadOwnedRows(
    actorUserId,
    cohortId,
    exportType,
  );
  if (rows === null) {
    throw new ExportBoundaryError("EXPORT_NOT_AVAILABLE", 404);
  }
  return rows;
}
