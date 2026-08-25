import { lessonSpecSchema, normalizedDocumentSchema } from "@avlp/schemas";
import { describe, expect, it } from "vitest";
import {
  canonicalFivePageScienceDocument,
  canonicalScienceLesson,
  canonicalSciencePreview,
  mvpHappyPathStages,
  mvpHappyPathEvidence,
  mvpMetricCatalog,
  mvpQuotaPolicy,
  mvpRecoveryScenarios,
  unchangedArtifactReuse,
} from "./mvp-acceptance.js";

describe("ST-071 canonical MVP acceptance fixture", () => {
  it("validates the five-page science source and three-minute LessonSpec", () => {
    expect(
      normalizedDocumentSchema.parse(canonicalFivePageScienceDocument)
        .pageCount,
    ).toBe(5);
    const lesson = lessonSpecSchema.parse(canonicalScienceLesson);
    expect(lesson.targetDurationSeconds).toBe(180);
    expect(
      lesson.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0),
    ).toBe(180);
    expect(lesson.scenes).toHaveLength(6);
  });

  it("keeps every scene citation resolvable against immutable parser output", () => {
    const blockIds = new Set(
      canonicalFivePageScienceDocument.blocks.map(({ id }) => id),
    );
    for (const scene of canonicalScienceLesson.scenes)
      for (const sourceRef of scene.sourceRefs) {
        expect(sourceRef.documentId).toBe(canonicalFivePageScienceDocument.id);
        expect(sourceRef.parsedDocumentVersion).toBe(1);
        expect(sourceRef.blockIds.every((id) => blockIds.has(id))).toBe(true);
      }
  });

  it("has monotonic captions and one narration track for every scene", () => {
    expect(canonicalSciencePreview.captions).toHaveLength(
      canonicalScienceLesson.scenes.length,
    );
    expect(canonicalSciencePreview.narrationTracks).toHaveLength(
      canonicalScienceLesson.scenes.length,
    );
    canonicalSciencePreview.captions.forEach((caption, index) => {
      expect(caption.startFrame).toBeGreaterThanOrEqual(
        index === 0 ? 0 : canonicalSciencePreview.captions[index - 1]!.endFrame,
      );
      expect(caption.endFrame).toBeGreaterThan(caption.startFrame);
    });
  });

  it("registers every end-to-end step and required recovery case", () => {
    expect(mvpHappyPathStages).toHaveLength(17);
    expect(new Set(mvpHappyPathStages).size).toBe(17);
    expect(Object.keys(mvpHappyPathEvidence)).toEqual([...mvpHappyPathStages]);
    expect(mvpRecoveryScenarios.map(({ failure }) => failure)).toEqual([
      "ingestion",
      "invalid-ai-output",
      "one-scene-tts",
      "stale-edit",
      "missing-asset",
      "render",
      "revoked-share",
      "deleted-project",
    ]);
  });

  it("pins all release quotas and unchanged-content reuse checks", () => {
    expect(mvpQuotaPolicy).toMatchObject({
      maximumSourcePages: 20,
      maximumScenes: 100,
      maximumRegenerationsPerHour: 10,
      maximumProviderCallsPerHour: 60,
      maximumConcurrentRendersPerProject: 1,
    });
    expect(unchangedArtifactReuse).toHaveLength(6);
    for (const check of unchangedArtifactReuse) {
      expect(check.reused).toBe(true);
      expect(check.repeatedContentHash).toBe(check.originalContentHash);
    }
  });

  it("defines evidence sources for all nine product and eight quality metrics", () => {
    expect(mvpMetricCatalog).toHaveLength(17);
    expect(new Set(mvpMetricCatalog.map(({ metric }) => metric)).size).toBe(17);
    expect(mvpMetricCatalog.every(({ source }) => source.length > 0)).toBe(
      true,
    );
  });
});
