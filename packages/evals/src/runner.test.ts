import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  lessonSpecSchema,
  lessonSpecVersion,
  readableLessonSpecVersions,
} from "@avlp/schemas";
import { evaluationCaseSchema } from "./contracts.js";
import {
  defaultFixturesRoot,
  runEvaluationCase,
  runFixtureSuite,
} from "./runner.js";

const root = defaultFixturesRoot();

function expectedOutcomes(): { id: string; expectedPass: boolean }[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name, "case.json"))
    .filter((path) => existsSync(path))
    .map((path) =>
      evaluationCaseSchema.parse(
        JSON.parse(readFileSync(path, "utf8")) as unknown,
      ),
    )
    .map(({ id, expectedPass }) => ({ id, expectedPass }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

it("matches every fixture's expected pass/fail outcome", async () => {
  const results = await runFixtureSuite(root);
  const expected = new Map(
    expectedOutcomes().map(({ id, expectedPass }) => [id, expectedPass]),
  );
  expect(results.map((result) => result.caseId).sort()).toEqual(
    [...expected.keys()].sort(),
  );
  for (const result of results) {
    expect(result.passed, result.caseId).toBe(expected.get(result.caseId));
  }
});

it("reports the known-invalid LessonSpec as a failed evaluation result", async () => {
  const results = await runFixtureSuite(root);
  expect(
    results.find((result) => result.caseId === "invalid-lesson-spec"),
  ).toMatchObject({
    passed: false,
    checks: expect.arrayContaining([
      expect.objectContaining({ name: "lesson-spec-schema", passed: false }),
    ]),
  });
});

it("produces deterministic results across repeated runs", async () => {
  const first = await runFixtureSuite(root);
  const second = await runFixtureSuite(root);
  expect(JSON.stringify(first)).toBe(JSON.stringify(second));
});

it("reports malformed case metadata as a failed evaluation result", async () => {
  const dir = await mkdtemp(join(tmpdir(), "avlp-evals-"));
  const metadataPath = join(dir, "case.json");
  await writeFile(metadataPath, JSON.stringify({ id: 42 }));
  const result = await runEvaluationCase(metadataPath);
  expect(result.passed).toBe(false);
  expect(result.checks).toEqual([
    expect.objectContaining({ name: "case-metadata", passed: false }),
  ]);
});

it("pins valid lesson-spec fixtures to a readable LessonSpec version that parses unchanged", async () => {
  const validFixtures = [
    "photosynthesis.json",
    "water-cycle.json",
    "solids-liquids.json",
    "leaf-figure.json",
    "low-quality.json",
  ];
  // ST-104: 1.9 widened only the audience, and 1.8 is read in place. The
  // baseline stays on 1.8 on purpose: it proves stored lessons still validate
  // byte-for-byte (ST-098 parity). Dropping 1.8 from the readable set fails
  // this loudly, as any contract break should.
  expect(readableLessonSpecVersions).toContain(lessonSpecVersion);
  for (const file of validFixtures) {
    const fixture = JSON.parse(
      readFileSync(join(root, "lesson-specs", file), "utf8"),
    ) as { schemaVersion: string };
    expect(
      readableLessonSpecVersions.some(
        (version) => version === fixture.schemaVersion,
      ),
      file,
    ).toBe(true);
    expect(lessonSpecSchema.parse(fixture), file).toEqual(fixture);
  }
});
