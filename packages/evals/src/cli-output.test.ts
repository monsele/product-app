import { expect, it } from "vitest";
import { buildEvaluationReport } from "./report.js";
import { defaultFixturesRoot } from "./runner.js";

it("emits a report conforming to the evaluation result schema", async () => {
  const output = await buildEvaluationReport(defaultFixturesRoot());
  expect(output.passed).toBe(true);
  expect(output.results.every((result) => result.checks.length > 0)).toBe(true);
});

it("matches the committed CLI output snapshot", async () => {
  const output = await buildEvaluationReport(defaultFixturesRoot());
  expect(JSON.stringify(output, null, 2)).toMatchSnapshot();
});
