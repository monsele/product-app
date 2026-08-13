import { lessonSpecSchema, type LessonSpec } from "@avlp/schemas";
import {
  calculateLessonTimeline,
  type FullLessonCompositionProps,
} from "./full-lesson.js";

const sourceDocumentId = "00000000-0000-7000-8000-000000000101";
const sourceRef = (page: number, block: number) => ({
  blockIds: [`00000000-0000-7000-8000-000000000${110 + block}`],
  documentId: sourceDocumentId,
  pageStart: page,
  parsedDocumentVersion: 1,
  sectionId: `00000000-0000-7000-8000-000000000${120 + page}`,
});
const sceneBase = (
  id: number,
  order: number,
  narration: string,
  transition: "cut" | "fade" | "slide",
  page: number,
) => ({
  assetBindings: [],
  durationSeconds: 30,
  generatedAdditions: [],
  id: `00000000-0000-7000-8000-000000000${200 + id}`,
  narration,
  onScreenText: [],
  order,
  sourceRefs: [sourceRef(page, id)],
  transition,
});

export const fivePagePhotosynthesisSourceFixture = Object.freeze({
  license: "Original educational text written for the AVLP regression fixture.",
  pages: Object.freeze([
    "Plants need a way to make and store food.",
    "Photosynthesis is the process plants use to make glucose.",
    "Leaves collect sunlight while roots absorb water.",
    "Carbon dioxide enters leaves from the air.",
    "Glucose stores energy and oxygen is released.",
  ]),
  title: "How plants make food",
});

export const photosynthesisThreeMinuteLesson = lessonSpecSchema.parse({
  audience: {
    ageBand: "8-10",
    difficulty: "introductory",
    priorKnowledge: ["Plants need water."],
  },
  lessonId: "00000000-0000-7000-8000-000000000102",
  objectiveIds: ["00000000-0000-7000-8000-000000000103"],
  projectId: "00000000-0000-7000-8000-000000000104",
  schemaVersion: "1.8",
  scenes: [
    {
      ...sceneBase(
        1,
        1,
        "How can a plant make its own food without a kitchen?",
        "fade",
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
        "slide",
        2,
      ),
      template: "definition",
      title: "Photosynthesis",
      visual: {
        definition:
          "The process plants use to make glucose using light energy.",
        exampleLabel: "Think of it as",
        exampleText: "a solar-powered food maker.",
        term: "Photosynthesis",
      },
    },
    {
      ...sceneBase(
        3,
        3,
        "First, leaves collect sunlight. Next, roots take in water. Carbon dioxide enters the leaf from the air.",
        "fade",
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
        "slide",
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
        outputs: [{ label: "Glucose" }, { label: "Oxygen" }],
        process: { label: "Photosynthesis" },
      },
    },
    {
      ...sceneBase(
        5,
        5,
        "Glucose gives the plant stored energy for growth. Oxygen leaves the plant and becomes part of the air we breathe.",
        "fade",
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
        "cut",
        5,
      ),
      template: "summary",
      title: "Remember photosynthesis",
      visual: {
        callToAction: "Name the three inputs.",
        centralModel: "light + water + carbon dioxide makes glucose + oxygen",
        takeaways: [
          {
            objectiveId: "00000000-0000-7000-8000-000000000103",
            text: "Photosynthesis makes glucose.",
          },
          { text: "Plants need sunlight, water, and carbon dioxide." },
          { text: "Oxygen is released." },
        ],
      },
    },
  ],
  subject: "Science",
  targetDurationSeconds: 180,
  themeId: "mvp-default",
  title: "How Plants Make Food",
  tone: "friendly",
  voice: { providerVoiceId: "fixture-silence", speakingRate: 1 },
} satisfies LessonSpec);

const timeline = calculateLessonTimeline(photosynthesisThreeMinuteLesson);
export const photosynthesisThreeMinutePreview = Object.freeze({
  captions: timeline.map((segment, index) => ({
    endFrame: segment.endFrameExclusive,
    sceneId: segment.sceneId,
    startFrame: segment.startFrame,
    text: photosynthesisThreeMinuteLesson.scenes[index]?.narration ?? "",
  })),
  lesson: photosynthesisThreeMinuteLesson,
  narrationTracks: timeline.map((segment) => ({
    kind: "deterministic-silence" as const,
    sceneId: segment.sceneId,
  })),
} satisfies FullLessonCompositionProps);

export const visualPedagogicalReviewNotes = Object.freeze([
  "The six 30-second scenes give early learners time to read each visual before the next transition.",
  "Captions intentionally repeat the fixture narration; later audio generation replaces deterministic silence with timed audio.",
  "The cause-and-effect scene simplifies plant growth to preserve an introductory, source-grounded explanation.",
]);
