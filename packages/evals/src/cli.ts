import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { evaluationCaseSchema, evaluationResultSchema } from "./contracts.js";
import { defaultFixturesRoot, runFixtureSuite } from "./runner.js";

const root = defaultFixturesRoot();
const results = await runFixtureSuite(root);
const entries = await readdir(root, { withFileTypes: true });
const expected = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
  try { return evaluationCaseSchema.parse(JSON.parse(await readFile(join(root, entry.name, "case.json"), "utf8")) as unknown); } catch { return undefined; }
}));
const expectedById = new Map(expected.filter((item): item is NonNullable<typeof item> => item !== undefined).map((item) => [item.id, item.expectedPass]));
const output = { results: results.map((result) => evaluationResultSchema.parse(result)), passed: results.every((result) => expectedById.get(result.caseId) === result.passed) };
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
process.exitCode = output.passed ? 0 : 1;
