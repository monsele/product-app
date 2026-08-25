import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  evaluationCaseSchema,
  evaluationResultSchema,
  type EvaluationResult,
} from "./contracts.js";
import { runFixtureSuite } from "./runner.js";

export interface EvaluationReport {
  results: EvaluationResult[];
  passed: boolean;
}

export async function buildEvaluationReport(
  fixturesRoot: string,
): Promise<EvaluationReport> {
  const results = await runFixtureSuite(fixturesRoot);
  const entries = await readdir(fixturesRoot, { withFileTypes: true });
  const expected = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        try {
          return evaluationCaseSchema.parse(
            JSON.parse(
              await readFile(join(fixturesRoot, entry.name, "case.json"), "utf8"),
            ) as unknown,
          );
        } catch {
          return undefined;
        }
      }),
  );
  const expectedById = new Map(
    expected
      .filter((item): item is NonNullable<typeof item> => item !== undefined)
      .map((item) => [item.id, item.expectedPass]),
  );
  return {
    results: results.map((result) => evaluationResultSchema.parse(result)),
    passed: results.every(
      (result) => expectedById.get(result.caseId) === result.passed,
    ),
  };
}
