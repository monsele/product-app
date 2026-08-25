import { z } from "zod";

export const rubricDimensionSchema = z.enum([
  "factualFaithfulness",
  "objectiveCoverage",
  "ageAppropriateness",
  "narrationClarity",
  "sceneTemplateSuitability",
  "visualVariety",
  "unsupportedClaims",
  "duration",
  "textDensity",
  "captionAlignment",
  "assetConsistency",
]);
export type RubricDimension = z.infer<typeof rubricDimensionSchema>;

export const evaluationCaseSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  licensing: z.object({ source: z.literal("synthetic"), note: z.string().min(1) }).strict(),
  categories: z.array(z.enum(["clean-text", "process", "comparison", "figure", "low-quality"])).min(1),
  expectedPass: z.boolean().default(true),
  expectedObjectiveIds: z.array(z.string().min(1)).min(1),
  rubric: z.record(rubricDimensionSchema, z.enum(["manual", "automated"])),
  files: z.object({ source: z.string(), normalizedDocument: z.string(), lessonSpec: z.string(), audioTiming: z.string(), expectedFrame: z.string() }).strict(),
}).strict();
export type EvaluationCase = z.infer<typeof evaluationCaseSchema>;

export const evaluationResultSchema = z.object({
  caseId: z.string(),
  passed: z.boolean(),
  checks: z.array(z.object({ name: z.string(), passed: z.boolean(), message: z.string() }).strict()),
}).strict();
export type EvaluationResult = z.infer<typeof evaluationResultSchema>;
