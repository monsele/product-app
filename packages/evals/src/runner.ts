import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseLessonSpec, parseNormalizedDocument } from "@avlp/schemas";
import { ZodError } from "zod";
import { evaluationCaseSchema, type EvaluationResult } from "./contracts.js";

type Check = EvaluationResult["checks"][number];
const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(path, "utf8")) as unknown;
const check = (name: string, passed: boolean, message: string): Check => ({ name, passed, message });

export async function runEvaluationCase(metadataPath: string): Promise<EvaluationResult> {
  let metadata: ReturnType<typeof evaluationCaseSchema.parse>;
  try { metadata = evaluationCaseSchema.parse(await readJson(metadataPath)); }
  catch (error) { return { caseId: metadataPath, passed: false, checks: [check("case-metadata", false, error instanceof ZodError ? error.issues[0]?.message ?? "Invalid case metadata." : "Invalid case metadata.")] }; }
  const root = dirname(metadataPath);
  const checks: Check[] = [];
  const fixtureFiles = Object.values(metadata.files);
  const filesPresent = await Promise.all(fixtureFiles.map(async (file) => access(resolve(root, file)).then(() => true).catch(() => false)));
  checks.push(check("fixture-files", filesPresent.every(Boolean), "All declared fixture artifacts are present."));
  let document: ReturnType<typeof parseNormalizedDocument> | undefined;
  let lesson: ReturnType<typeof parseLessonSpec> | undefined;
  try { document = parseNormalizedDocument(await readJson(resolve(root, metadata.files.normalizedDocument))); checks.push(check("normalized-document-schema", true, "NormalizedDocument is valid.")); }
  catch (error) { checks.push(check("normalized-document-schema", false, error instanceof ZodError ? error.issues[0]?.message ?? "Invalid normalized document." : "Invalid normalized document.")); }
  try { lesson = parseLessonSpec(await readJson(resolve(root, metadata.files.lessonSpec))); checks.push(check("lesson-spec-schema", true, "LessonSpec is valid.")); }
  catch (error) { checks.push(check("lesson-spec-schema", false, error instanceof ZodError ? error.issues[0]?.message ?? "Invalid LessonSpec." : "Invalid LessonSpec.")); }
  if (lesson !== undefined) {
    const duration = lesson.scenes.reduce((total, scene) => total + scene.durationSeconds, 0);
    checks.push(check("duration", duration === lesson.targetDurationSeconds, `Scene duration is ${duration}s; target is ${lesson.targetDurationSeconds}s.`));
    const covered = metadata.expectedObjectiveIds.every((id) => lesson.objectiveIds.includes(id));
    checks.push(check("objective-coverage-placeholder", covered, "Expected objective IDs are present in the LessonSpec."));
    const dense = lesson.scenes.some((scene) => scene.onScreenText.some((text) => text.length > 80));
    checks.push(check("text-density", !dense, "On-screen text stays within the 80-character baseline limit."));
  }
  if (lesson !== undefined && document !== undefined) {
    const blockIds = new Set(document.blocks.map((block) => block.id)); const figureIds = new Set(document.figures.map((figure) => figure.id)); const tableIds = new Set(document.tables.map((table) => table.id));
    const resolvable = lesson.scenes.every((scene) => scene.sourceRefs.every((ref) => ref.documentId === document.id && ref.parsedDocumentVersion === document.parsedDocumentVersion && ref.blockIds.every((id) => blockIds.has(id)) && (ref.figureIds ?? []).every((id) => figureIds.has(id)) && (ref.tableIds ?? []).every((id) => tableIds.has(id))));
    checks.push(check("citation-resolvability", resolvable, "Scene source references resolve against the normalized document."));
  }
  return { caseId: metadata.id, passed: checks.every((item) => item.passed), checks };
}

export async function runFixtureSuite(fixturesRoot: string): Promise<EvaluationResult[]> {
  const entries = await readdir(fixturesRoot, { withFileTypes: true });
  const casePaths = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const path = join(fixturesRoot, entry.name, "case.json");
    return (await access(path).then(() => true).catch(() => false)) ? path : undefined;
  }));
  return Promise.all(casePaths.filter((path): path is string => path !== undefined).sort().map(runEvaluationCase));
}

export const defaultFixturesRoot = (): string => resolve(import.meta.dirname, "../fixtures");
