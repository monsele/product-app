import { expect, it } from "vitest";
import { defaultFixturesRoot, runFixtureSuite } from "./runner.js";

it("passes the five deterministic baseline fixtures", async () => {
  const results = await runFixtureSuite(defaultFixturesRoot());
  expect(results).toHaveLength(6);
  expect(results.filter((result) => result.caseId !== "invalid-lesson-spec").every((result) => result.passed)).toBe(true);
});

it("reports the known-invalid LessonSpec as a failed evaluation result", async () => {
  const results = await runFixtureSuite(defaultFixturesRoot());
  expect(results.find((result) => result.caseId === "invalid-lesson-spec")).toMatchObject({ passed: false, checks: expect.arrayContaining([expect.objectContaining({ name: "lesson-spec-schema", passed: false })]) });
});
