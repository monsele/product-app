import { lessonSpecSchema, normalizedDocumentSchema } from "@avlp/schemas";

const documentId = "00000000-0000-7000-8000-000000000101";
const sourceDocumentId = "00000000-0000-7000-8000-000000000100";
const sectionId = (page: number) =>
  `00000000-0000-7000-8000-000000000${120 + page}`;
const blockId = (index: number) =>
  `00000000-0000-7000-8000-000000000${110 + index}`;
const sourcePages = [
  "Plants need a way to make and store food.",
  "Photosynthesis is the process plants use to make glucose.",
  "Leaves collect sunlight while roots absorb water.",
  "Carbon dioxide enters leaves from the air.",
  "Glucose stores energy and oxygen is released.",
] as const;

export const canonicalFivePageScienceDocument = normalizedDocumentSchema.parse({
  schemaVersion: "1.0",
  id: documentId,
  sourceDocumentId,
  parsedDocumentVersion: 1,
  language: "en",
  pageCount: 5,
  title: "How plants make food",
  sections: sourcePages.map((_text, index) => {
    const page = index + 1;
    const blockIds = page === 5 ? [blockId(5), blockId(6)] : [blockId(page)];
    return {
      id: sectionId(page),
      order: page,
      level: 1,
      heading: page === 1 ? "How plants make food" : `Page ${page}`,
      pageStart: page,
      blockIds,
      figureIds: [],
      tableIds: [],
    };
  }),
  blocks: [
    ...sourcePages.map((text, index) => ({
      id: blockId(index + 1),
      sectionId: sectionId(index + 1),
      order: index + 1,
      pageStart: index + 1,
      kind: "paragraph" as const,
      text,
    })),
    {
      id: blockId(6),
      sectionId: sectionId(5),
      order: 6,
      pageStart: 5,
      kind: "paragraph" as const,
      text: "Photosynthesis uses light, water, and carbon dioxide to make glucose and release oxygen.",
    },
  ],
  figures: [],
  tables: [],
  warnings: [],
});

const sourceRef = (page: number, block: number) => ({
  documentId,
  parsedDocumentVersion: 1,
  pageStart: page,
  sectionId: sectionId(page),
  blockIds: [blockId(block)],
});
const sceneBase = (
  id: number,
  order: number,
  narration: string,
  page: number,
) => ({
  id: `00000000-0000-7000-8000-000000000${200 + id}`,
  order,
  narration,
  durationSeconds: 30,
  onScreenText: [],
  transition: order === 1 ? ("fade" as const) : ("slide" as const),
  assetBindings: [],
  sourceRefs: [sourceRef(page, id)],
  generatedAdditions: [],
});

export const canonicalScienceLesson = lessonSpecSchema.parse({
  schemaVersion: "1.8",
  lessonId: "00000000-0000-7000-8000-000000000102",
  projectId: "00000000-0000-7000-8000-000000000104",
  title: "How Plants Make Food",
  subject: "Science",
  audience: {
    ageBand: "8-10",
    difficulty: "introductory",
    priorKnowledge: ["Plants need water."],
  },
  targetDurationSeconds: 180,
  tone: "friendly",
  themeId: "mvp-default",
  objectiveIds: ["00000000-0000-7000-8000-000000000103"],
  voice: { providerVoiceId: "fixture-silence", speakingRate: 1 },
  scenes: [
    {
      ...sceneBase(
        1,
        1,
        "How can a plant make its own food without a kitchen?",
        1,
      ),
      template: "hook",
      title: "A plant kitchen",
      visual: {
        prompt: "Find the ingredients.",
        question: "How does a plant make food?",
        supportingElements: ["Sunlight", "Water"],
      },
    },
    {
      ...sceneBase(
        2,
        2,
        "Photosynthesis is the process plants use to make glucose, a sugar that stores energy.",
        2,
      ),
      template: "definition",
      title: "Photosynthesis",
      visual: {
        term: "Photosynthesis",
        definition:
          "The process plants use to make glucose using light energy.",
        exampleLabel: "Think of it as",
        exampleText: "a solar-powered food maker.",
      },
    },
    {
      ...sceneBase(
        3,
        3,
        "First, leaves collect sunlight. Next, roots take in water. Carbon dioxide enters the leaf from the air.",
        3,
      ),
      template: "process",
      title: "Collect ingredients",
      visual: {
        steps: [
          "Leaves collect sunlight",
          "Roots absorb water",
          "Leaves take in carbon dioxide",
        ],
      },
    },
    {
      ...sceneBase(
        4,
        4,
        "Sunlight, water, and carbon dioxide go into the plant. The plant uses them to make glucose and releases oxygen.",
        4,
      ),
      template: "input-process-output",
      title: "The photosynthesis system",
      visual: {
        inputs: [
          { label: "Sunlight" },
          { label: "Water" },
          { label: "Carbon dioxide" },
        ],
        process: { label: "Photosynthesis" },
        outputs: [{ label: "Glucose" }, { label: "Oxygen" }],
      },
    },
    {
      ...sceneBase(
        5,
        5,
        "Glucose gives the plant stored energy for growth. Oxygen leaves the plant and becomes part of the air we breathe.",
        5,
      ),
      template: "cause-effect",
      title: "Why the products matter",
      visual: {
        causes: [{ id: "glucose", label: "Glucose stores energy" }],
        connections: [{ from: "glucose", to: "growth" }],
        effects: [{ id: "growth", label: "Plant grows" }],
      },
    },
    {
      ...sceneBase(
        6,
        6,
        "Plants use sunlight, water, and carbon dioxide to make glucose and release oxygen. That is photosynthesis.",
        5,
      ),
      template: "summary",
      title: "Remember photosynthesis",
      visual: {
        centralModel: "light + water + carbon dioxide makes glucose + oxygen",
        takeaways: [
          {
            objectiveId: "00000000-0000-7000-8000-000000000103",
            text: "Photosynthesis makes glucose.",
          },
          { text: "Plants need sunlight, water, and carbon dioxide." },
          { text: "Oxygen is released." },
        ],
        callToAction: "Name the three inputs.",
      },
    },
  ],
});

export const canonicalSciencePreview = {
  captions: canonicalScienceLesson.scenes.map((scene, index) => ({
    sceneId: scene.id,
    startFrame: index * 900,
    endFrame: (index + 1) * 900,
    text: scene.narration,
  })),
  narrationTracks: canonicalScienceLesson.scenes.map((scene) => ({
    kind: "deterministic-silence" as const,
    sceneId: scene.id,
  })),
};

export const mvpHappyPathStages = [
  "register",
  "sign-in",
  "create-project",
  "upload",
  "ingest",
  "review-source",
  "configure",
  "approve-objectives",
  "approve-outline",
  "approve-narration",
  "edit-storyboard",
  "generate-audio-and-captions",
  "preview",
  "validate",
  "render-1080p-mp4",
  "export-and-share",
  "restore-version",
] as const;

export const mvpHappyPathEvidence: Record<
  (typeof mvpHappyPathStages)[number],
  readonly string[]
> = {
  register: ["packages/auth/src/gateway.integration.test.ts"],
  "sign-in": ["packages/auth/src/gateway.integration.test.ts"],
  "create-project": ["apps/api/src/projects.integration.test.ts"],
  upload: ["apps/api/src/source-uploads.test.ts"],
  ingest: [
    "apps/pipeline-worker/src/document-ingestion-job.integration.test.ts",
  ],
  "review-source": [
    "apps/api/src/parsed-document-review.test.ts",
    "apps/api/src/source-section-selection.integration.test.ts",
  ],
  configure: ["apps/api/src/lesson-configuration.integration.test.ts"],
  "approve-objectives": ["apps/api/src/objectives-editor.integration.test.ts"],
  "approve-outline": ["apps/api/src/outline.integration.test.ts"],
  "approve-narration": ["apps/api/src/narration-editor.test.ts"],
  "edit-storyboard": ["apps/api/src/storyboard.integration.test.ts"],
  "generate-audio-and-captions": [
    "apps/pipeline-worker/src/scene-audio-job.test.ts",
    "apps/pipeline-worker/src/captions.test.ts",
  ],
  preview: [
    "apps/web/app/workspace/[projectId]/preview/preview-player.e2e.test.ts",
  ],
  validate: ["apps/api/src/lesson-validation.test.ts"],
  "render-1080p-mp4": ["apps/renderer/src/render-worker.smoke.test.ts"],
  "export-and-share": [
    "apps/api/src/exports.test.ts",
    "apps/api/src/share-links.test.ts",
  ],
  "restore-version": ["apps/api/src/lesson-versions.test.ts"],
};

export const mvpRecoveryScenarios = [
  {
    failure: "ingestion",
    recovery: "retry-idempotently",
    evidence: [
      "apps/pipeline-worker/src/document-ingestion-job.integration.test.ts",
    ],
  },
  {
    failure: "invalid-ai-output",
    recovery: "repair-or-retry-without-persisting-invalid-output",
    evidence: ["packages/provider-adapters/src/structured-output.test.ts"],
  },
  {
    failure: "one-scene-tts",
    recovery: "retry-only-the-failed-scene",
    evidence: ["apps/pipeline-worker/src/scene-audio-job.test.ts"],
  },
  {
    failure: "stale-edit",
    recovery: "return-edit-conflict-with-latest-revision",
    evidence: ["apps/api/src/storyboard-scene-editor.test.ts"],
  },
  {
    failure: "missing-asset",
    recovery: "block-render-and-link-to-the-scene",
    evidence: ["apps/api/src/lesson-validation.test.ts"],
  },
  {
    failure: "render",
    recovery: "retry-with-the-approved-lesson-version",
    evidence: ["apps/api/src/renders.test.ts"],
  },
  {
    failure: "revoked-share",
    recovery: "return-not-found-without-project-data",
    evidence: ["apps/api/src/share-links.test.ts"],
  },
  {
    failure: "deleted-project",
    recovery: "deny-project-and-artifact-access",
    evidence: [
      "apps/api/src/projects.integration.test.ts",
      "apps/pipeline-worker/src/project-cleanup.integration.test.ts",
    ],
  },
] as const;

export const mvpQuotaPolicy = Object.freeze({
  maximumSourcePages: 20,
  allowedDurationsSeconds: [180, 300, 420] as const,
  maximumScenes: 100,
  maximumRegenerationsPerHour: 10,
  maximumProviderCallsPerHour: 60,
  maximumUploadBytes: 25 * 1024 * 1024,
  maximumConcurrentRendersPerProject: 1,
  maximumRenderStartsPerProjectHour: 12,
});

export const unchangedArtifactReuse = [
  { artifact: "source", evidence: "apps/api/src/source-uploads.test.ts" },
  { artifact: "audio", evidence: "apps/api/src/scene-audio.test.ts" },
  {
    artifact: "captions",
    evidence: "apps/pipeline-worker/src/captions.test.ts",
  },
  {
    artifact: "assets",
    evidence: "apps/api/src/storyboard-service.test.ts",
  },
  {
    artifact: "previews",
    evidence: "apps/api/src/preview-manifest.test.ts",
  },
  { artifact: "renders", evidence: "apps/api/src/renders.test.ts" },
].map(({ artifact, evidence }) => ({
  artifact,
  evidence,
  originalContentHash: "a".repeat(64),
  repeatedContentHash: "a".repeat(64),
  reused: true,
}));

export const mvpMetricCatalog = [
  {
    metric: "successful-ingestion-rate",
    source:
      "document.ingestion_completed and document.validation_rejected audit events",
  },
  {
    metric: "storyboard-generation-rate",
    source: "storyboard job completion records",
  },
  { metric: "final-render-rate", source: "render job and artifact records" },
  {
    metric: "teacher-edits-per-lesson",
    source: "objectives, outline, narration, and storyboard edit audit events",
  },
  {
    metric: "regenerated-scenes",
    source: "storyboard candidate generation audit and usage records",
  },
  {
    metric: "upload-to-first-preview-time",
    source: "document.uploaded audit time and preview manifest creation time",
  },
  {
    metric: "approval-to-final-render-time",
    source: "lesson.approved audit time and completed render time",
  },
  {
    metric: "render-download-or-share-rate",
    source: "export.downloaded and share.created audit events",
  },
  {
    metric: "abandonment-before-render-rate",
    source: "project activity with no completed render",
  },
  {
    metric: "factual-faithfulness",
    source: "grounding and lesson validation results",
  },
  {
    metric: "learning-objective-coverage",
    source: "lesson validation results",
  },
  { metric: "age-appropriateness", source: "prompt evaluation results" },
  { metric: "narration-clarity", source: "prompt evaluation results" },
  {
    metric: "visual-template-suitability",
    source: "prompt and visual regression results",
  },
  { metric: "text-density-per-scene", source: "lesson validation results" },
  {
    metric: "caption-timing-quality",
    source: "caption and lesson validation results",
  },
  { metric: "missing-asset-rate", source: "lesson validation results" },
] as const;
