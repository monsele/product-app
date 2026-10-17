import { describe, expect, it, vi } from "vitest";
import type { LessonValidationRun, ValidationIssue } from "@avlp/schemas";
import { recoveryStartSchema } from "@avlp/schemas";
import {
  recoveryTasksForIssues,
  readinessCapabilities,
} from "./lesson-readiness.js";
import { createApp, sessionCookieName } from "./app.js";
import {
  InMemoryOwnerScopedProjectRepository,
  ProjectAuthorizationService,
  createCrossUserProjectFixture,
  type AuthGateway,
} from "@avlp/auth";

const sceneId = "01989a3d-8e00-7000-8000-000000000003";
function issue(
  code: string,
  overrides: Partial<ValidationIssue> = {},
): ValidationIssue {
  return {
    id: sceneId,
    code,
    severity: "error",
    scopeType: "audio",
    scopeId: sceneId,
    sceneId,
    fieldPath: "scenes.0.audio",
    message: code,
    details: {},
    acknowledgeable: false,
    acknowledgedAt: null,
    ...overrides,
  } as ValidationIssue;
}
describe("lesson readiness", () => {
  it("groups the screenshot's four blockers under the scene's media preparation", () => {
    const tasks = recoveryTasksForIssues([
      issue("audio_not_ready"),
      issue("captions_not_ready"),
      issue("narration_duration_mismatch"),
      issue("lesson_duration_mismatch", { sceneId: null }),
    ]);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.issueCodes).toEqual([
      "audio_not_ready",
      "captions_not_ready",
      "narration_duration_mismatch",
    ]);
  });
  it("never treats missing citations or teaching changes as automatic repairs", () => {
    const tasks = recoveryTasksForIssues([
      issue("grounding_missing", { scopeType: "grounding" }),
      issue("text_overflow", { sceneId: null }),
    ]);
    expect(tasks.map((task) => task.action)).toEqual([
      "review_sources",
      "review_content",
    ]);
  });
  it("keeps editing and preview available while stale validation prevents render", () => {
    const run = {
      stale: true,
      status: "passed",
      issues: [],
    } as unknown as LessonValidationRun;
    expect(readinessCapabilities(true, run)).toEqual({
      edit: true,
      preview: true,
      render: false,
    });
    expect(readinessCapabilities(true, null).render).toBe(false);
    expect(readinessCapabilities(true, { ...run, stale: false }).render).toBe(
      true,
    );
  });
  it("rejects unbounded or ambiguous authorization", () => {
    const body = {
      expectedRevision: 1,
      idempotencyKey: "prepare-1",
      estimateFingerprint: "a".repeat(64),
      acceptedMaximumCostUsd: 1,
    };
    expect(recoveryStartSchema.safeParse(body).success).toBe(true);
    expect(
      recoveryStartSchema.safeParse({ ...body, acceptedMaximumCostUsd: -1 })
        .success,
    ).toBe(false);
    expect(
      recoveryStartSchema.safeParse({ ...body, rewrite: true }).success,
    ).toBe(false);
  });
  it("authorizes the read API before accessing preparation data", async () => {
    const fixture = createCrossUserProjectFixture();
    const auth: AuthGateway = {
      register: async () => {
        throw new Error("unused");
      },
      signIn: async () => null,
      currentSession: async (token) =>
        token === "owner" || token === "other"
          ? {
              id: token === "owner" ? fixture.ownerUserId : fixture.otherUserId,
              email: "teacher@example.test",
              displayName: "Teacher",
            }
          : null,
      signOut: async () => {},
      requestPasswordReset: async () => {},
      confirmPasswordReset: async () => {},
    };
    const read = vi.fn(async () => ({ enabled: true }));
    const app = await createApp({
      authGateway: auth,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      readinessService: { read } as unknown as NonNullable<NonNullable<Parameters<typeof createApp>[0]>["readinessService"]>,
    });
    try {
      const server = app.getHttpAdapter().getInstance();
      for (const [token, status] of [
        ["other", 404],
        ["missing", 401],
        ["owner", 200],
      ] as const) {
        const result = await server.inject({
          method: "GET",
          url: `/projects/${fixture.projectId}/readiness`,
          cookies: { [sessionCookieName]: token },
        });
        expect(result.statusCode).toBe(status);
      }
      expect(read).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});
