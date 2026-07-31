import {
  ExportBoundaryError,
  loadOwnedExport,
} from "../functions/_shared/export-core";

const cohortId = "d3000000-0000-4000-8000-000000000001";

it("returns one neutral denial for anonymous and cross-teacher exports", async () => {
  const repository = {
    async loadOwnedRows() {
      return null;
    },
  };
  await expect(
    loadOwnedExport(null, cohortId, "summary", repository),
  ).rejects.toEqual(new ExportBoundaryError("EXPORT_NOT_AVAILABLE", 404));
  await expect(
    loadOwnedExport("other-teacher", cohortId, "teacher-private", repository),
  ).rejects.toEqual(new ExportBoundaryError("EXPORT_NOT_AVAILABLE", 404));
});
