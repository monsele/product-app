import { buildEvaluationReport } from "./report.js";
import { defaultFixturesRoot } from "./runner.js";

const output = await buildEvaluationReport(defaultFixturesRoot());
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
process.exitCode = output.passed ? 0 : 1;
