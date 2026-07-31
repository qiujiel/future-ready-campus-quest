const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("../../src/shared/api/supabase", () => ({
  getSupabaseClient: () => ({
    functions: { invoke },
  }),
}));

import {
  supabaseTeacherGateway,
  TeacherGatewayError,
} from "../../src/teacher/api/teacherClient";

it("loads an owned cohort through the teacher dashboard boundary", async () => {
  const summary = {
    cohortId: "d3000000-0000-4000-8000-000000000001",
    enrolled: 0,
    active: 0,
    completed: 0,
    conceptAggregates: [],
    mostMissed: [],
    teamScores: [],
    generatedAt: "2030-01-01T09:00:00.000Z",
  };
  invoke.mockResolvedValueOnce({
    data: { summary },
    error: null,
  });

  await expect(
    supabaseTeacherGateway.getSummary(summary.cohortId),
  ).resolves.toEqual(summary);
  expect(invoke).toHaveBeenCalledWith("teacher-dashboard", {
    body: { cohortId: summary.cohortId },
  });
});

it("preserves the neutral cohort denial returned by the boundary", async () => {
  invoke.mockResolvedValueOnce({
    data: null,
    error: {
      context: {
        response: new Response(
          JSON.stringify({ error: "COHORT_NOT_AVAILABLE" }),
          {
            status: 404,
            headers: { "content-type": "application/json" },
          },
        ),
      },
    },
  });

  await expect(
    supabaseTeacherGateway.getSummary(
      "d3000000-0000-4000-8000-000000000099",
    ),
  ).rejects.toEqual(
    new TeacherGatewayError("COHORT_NOT_AVAILABLE"),
  );
});
