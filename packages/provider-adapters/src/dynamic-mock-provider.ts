import {
  type LanguageModelProvider,
  type ProviderCompletionRequest,
  type ProviderCompletionResponse,
  providerCompletionResponseSchema,
} from "./contracts.js";

/** Mirrors the storyboard scene bounds in `@avlp/schemas`. */
const STORYBOARD_SCENE_MIN_SECONDS = 3;
const STORYBOARD_SCENE_MAX_SECONDS = 60;
const STORYBOARD_SCENE_COUNT_MIN = 3;
const STORYBOARD_SCENE_COUNT_MAX = 50;

/**
 * Split the ordered narration blocks into `count` contiguous groups of as even
 * a size as possible, so every block is covered exactly once and in order.
 */
function groupNarrationBlocks(
  blockIds: readonly string[],
  count: number,
): string[][] {
  const groups: string[][] = [];
  let taken = 0;
  for (let index = 0; index < count; index++) {
    const remainingGroups = count - index;
    const size = Math.ceil((blockIds.length - taken) / remainingGroups);
    groups.push([...blockIds.slice(taken, taken + size)]);
    taken += size;
  }
  return groups;
}

/** Trim and hard-cap a string so it satisfies a bounded-text schema field. */
function clampText(value: string, max: number): string {
  const trimmed = value.trim().slice(0, max).trim();
  return trimmed.length > 0 ? trimmed : "Untitled";
}

function extractAllUuids(text: string): string[] {
  const matches = text.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
  );
  return matches ? [...new Set(matches.map((m) => m.toLowerCase()))] : [];
}

function extractBlockIds(text: string): string[] {
  const blockMatches = text.match(/"blockId":\s*"([^"]+)"/g);
  if (blockMatches && blockMatches.length > 0) {
    const ids = blockMatches
      .map((m) => {
        const parsed = /"blockId":\s*"([^"]+)"/.exec(m);
        return parsed ? parsed[1] : null;
      })
      .filter((id): id is string => typeof id === "string");
    if (ids.length > 0) return [...new Set(ids)];
  }
  return extractAllUuids(text);
}

function extractJsonArray<T = Record<string, unknown>>(
  text: string,
  prefix: string,
): T[] | null {
  const idx = text.indexOf(prefix);
  if (idx === -1) return null;
  const start = text.indexOf("[", idx + prefix.length);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "[") depth++;
    else if (text[i] === "]") {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(text.slice(start, i + 1));
          if (Array.isArray(parsed)) return parsed as T[];
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function extractJsonObject<T = Record<string, unknown>>(
  text: string,
  prefix: string,
): T | null {
  const idx = text.indexOf(prefix);
  if (idx === -1) return null;
  const start = text.indexOf("{", idx + prefix.length);
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(text.slice(start, i + 1));
          if (typeof parsed === "object" && parsed !== null) return parsed as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function extractTargetDuration(text: string): number {
  const match = text.match(/"targetDurationSeconds":\s*(\d+)/);
  if (match && match[1]) {
    const val = parseInt(match[1], 10);
    if (val === 180 || val === 300 || val === 420) return val;
    if (!isNaN(val) && val >= 30 && val <= 600) return val;
  }
  return 180;
}

function extractLessonTitle(text: string): string {
  const match = text.match(/"lessonTitle":\s*"([^"]+)"/);
  return match && match[1] ? match[1] : "Key Educational Topic";
}

function buildGroundedSentence(
  wordCount: number,
  index: number,
  title: string,
): string {
  const sentenceStarters = [
    `Let us examine how ${title} functions across different natural environments and measurable physical conditions.`,
    `The fundamental principles of ${title} demonstrate how various components interact together to maintain overall stability.`,
    `When energy transfers through the system every individual element responds in a predictable and consistent manner.`,
    `Scientific observations provide clear evidence that these important processes follow well established natural laws.`,
    `Understanding these core interactions allows researchers to make accurate predictions about complex behavioral patterns.`,
    `Each distinct part plays a crucial role in supporting the continuous function of the entire network.`,
    `By analyzing these key relationships students gain valuable insight into how scientific mechanisms operate in reality.`,
    `Careful measurement of these dynamics helps us quantify the exact changes occurring within the active structure.`,
    `In summary these foundational concepts clearly explain the major phenomena observed throughout our scientific study.`,
    `Finally reviewing these essential ideas helps ensure a thorough grasp of the primary educational learning goals.`,
  ];
  const extraWords = [
    "furthermore",
    "observable",
    "evidence",
    "dynamic",
    "structure",
    "system",
    "transfer",
    "reaction",
    "balance",
    "pattern",
    "component",
    "property",
    "measurement",
    "concept",
    "mechanism",
    "interaction",
    "principle",
    "analysis",
    "behavior",
    "cycle",
  ];

  const starter = sentenceStarters[index % sentenceStarters.length]!;
  let words = starter.replace(/[.,!]/g, "").split(/\s+/).filter(Boolean);
  if (words.length > wordCount) {
    words = words.slice(0, wordCount);
  } else {
    let eIdx = index * 3;
    while (words.length < wordCount) {
      words.push(extraWords[eIdx % extraWords.length]!);
      eIdx++;
    }
  }
  const sentence = words.join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
}

function generateSentencesForBlock(
  targetWords: number,
  srcBlock: string,
  outlineIndex: number,
  title: string,
): Array<{ text: string; sourceBlockIds: string[] }> {
  const sentenceCount = Math.max(1, Math.round(targetWords / 14));
  const wordCounts: number[] = [];
  let remaining = targetWords;
  for (let i = 0; i < sentenceCount; i++) {
    const count =
      i === sentenceCount - 1
        ? remaining
        : Math.round(remaining / (sentenceCount - i));
    const clamped = Math.min(24, Math.max(5, count));
    wordCounts.push(clamped);
    remaining -= clamped;
  }

  // Adjust if there is any remaining difference
  if (remaining !== 0 && wordCounts.length > 0) {
    for (let i = 0; i < wordCounts.length && remaining !== 0; i++) {
      if (remaining > 0 && wordCounts[i]! < 24) {
        wordCounts[i]! += 1;
        remaining -= 1;
      } else if (remaining < 0 && wordCounts[i]! > 5) {
        wordCounts[i]! -= 1;
        remaining += 1;
      }
    }
  }

  return wordCounts.map((count, sentenceIdx) => ({
    text: buildGroundedSentence(count, outlineIndex * 5 + sentenceIdx, title),
    sourceBlockIds: [srcBlock],
  }));
}

function generateObjectivesJson(text: string, allUuids: string[]): string {
  const blockIds = extractBlockIds(text);
  const fallbackBlocks =
    blockIds.length > 0
      ? blockIds
      : allUuids.length > 0
        ? allUuids.slice(0, 3)
        : [
            "019ffbf1-2222-7000-8000-000000000001",
            "019ffbf1-2223-7000-8000-000000000001",
            "019ffbf1-2224-7000-8000-000000000001",
          ];

  const b0 = fallbackBlocks[0]!;
  const b1 = fallbackBlocks[1] ?? b0;
  const b2 = fallbackBlocks[2] ?? b0;
  const title = extractLessonTitle(text);

  const output = {
    schemaVersion: "objectives-v1",
    objectives: [
      {
        statement: `Identify and describe the core principles of ${title}.`,
        verb: "identify",
        confidence: 0.9,
        sourceBlockIds: [b0],
      },
      {
        statement: `Explain the key mechanisms and processes involved in ${title}.`,
        verb: "explain",
        confidence: 0.85,
        sourceBlockIds: [b1],
      },
      {
        statement: `Apply the principles of ${title} to analyse practical scenarios.`,
        verb: "apply",
        confidence: 0.8,
        sourceBlockIds: [b2],
      },
    ],
    keyConcepts: [
      {
        text: `Foundational knowledge and structure of ${title}.`,
        sourceBlockIds: [b0],
      },
      {
        text: "How the primary components interact and function together.",
        sourceBlockIds: [b1],
      },
    ],
    prerequisiteKnowledge: [
      {
        text: "Familiarity with general science concepts and vocabulary.",
        sourceBlockIds: [b0],
      },
    ],
    vocabulary: [
      {
        term: "Primary Component",
        definition: "The fundamental unit or element of the topic.",
        sourceBlockIds: [b0],
      },
      {
        term: "Interaction",
        definition: "The way different components affect each other.",
        sourceBlockIds: [b1],
      },
    ],
    misconceptions: [
      {
        misconception: `Assuming ${title} occurs in isolation without interactions.`,
        correction:
          "These processes are interconnected with surrounding environmental factors.",
        sourceBlockIds: [b0],
      },
    ],
    assessmentQuestions: [
      {
        question: `What is the primary function of ${title}?`,
        sourceBlockIds: [b0],
      },
      {
        question: `How do the main parts of ${title} work together?`,
        sourceBlockIds: [b1],
      },
    ],
  };

  return JSON.stringify(output);
}

function generateOutlineJson(text: string, allUuids: string[]): string {
  const blockIds = extractBlockIds(text);
  const fallbackBlocks =
    blockIds.length > 0
      ? blockIds
      : allUuids.length > 0
        ? allUuids.slice(0, 3)
        : ["019ffbf1-2222-7000-8000-000000000001"];

  // Extract objective IDs from the prompt
  const objectiveMatches =
    text.match(/"id":\s*"([^"]+)"/g) ||
    text.match(/"objectiveId":\s*"([^"]+)"/g);
  let objectiveIds: string[] = [];
  if (objectiveMatches) {
    objectiveIds = objectiveMatches
      .map((m) => {
        const res = /"id":\s*"([^"]+)"|"objectiveId":\s*"([^"]+)"/.exec(m);
        return res ? (res[1] ?? res[2]) : null;
      })
      .filter((id): id is string => typeof id === "string");
  }
  objectiveIds = Array.from(new Set(objectiveIds));
  if (objectiveIds.length === 0) {
    objectiveIds =
      allUuids.length > 0
        ? allUuids.slice(0, 3)
        : ["019ffbf1-aaaa-7000-8000-000000000001"];
  }

  const duration = extractTargetDuration(text);
  const title = extractLessonTitle(text);
  const includeRecall =
    /"includeRecallQuestions":\s*true/.test(text) ||
    /includeRecallQuestions:\s*true/i.test(text);

  const b0 = fallbackBlocks[0]!;
  const b1 = fallbackBlocks[1] ?? b0;
  const b2 = fallbackBlocks[2] ?? b1;

  type OutlineItemDef = {
    kind: "hook" | "concept" | "example" | "summary" | "recall_question";
    title: string;
    description: string;
    sourceBlockIds: string[];
    objectiveIds: string[];
  };

  const rawItems: OutlineItemDef[] = [];
  rawItems.push({
    kind: "hook",
    title: `Introduction: The Wonder of ${title}`,
    description: "Engage students with an intriguing question and overview.",
    sourceBlockIds: [b0],
    objectiveIds: [objectiveIds[0]!],
  });

  if (duration <= 180) {
    rawItems.push({
      kind: "concept",
      title: `Core Concept: ${title} Principles`,
      description: "Core conceptual explanation and step-by-step breakdown.",
      sourceBlockIds:
        fallbackBlocks.length > 1 ? fallbackBlocks.slice(0, 2) : [b0],
      objectiveIds,
    });
    rawItems.push({
      kind: "example",
      title: `Applied Example: ${title} in Action`,
      description: "Concrete demonstration and real-world example.",
      sourceBlockIds: [b1],
      objectiveIds: [objectiveIds[1] ?? objectiveIds[0]!],
    });
  } else if (duration <= 300) {
    rawItems.push({
      kind: "concept",
      title: `Core Concept: Fundamentals of ${title}`,
      description: "Foundational conceptual explanation and key definitions.",
      sourceBlockIds: [b0],
      objectiveIds,
    });
    rawItems.push({
      kind: "concept",
      title: `Mechanisms & Interactions in ${title}`,
      description:
        "In-depth breakdown of system mechanisms and component dynamics.",
      sourceBlockIds: [b1],
      objectiveIds,
    });
    rawItems.push({
      kind: "example",
      title: `Primary Case Study: ${title} in Practice`,
      description: "Real-world scenario illustrating primary principles.",
      sourceBlockIds: [b1],
      objectiveIds: [objectiveIds[1] ?? objectiveIds[0]!],
    });
    rawItems.push({
      kind: "example",
      title: `Comparative Analysis: Practical Applications`,
      description:
        "Comparative example analyzing edge cases and observable outcomes.",
      sourceBlockIds: [b2],
      objectiveIds: [objectiveIds[2] ?? objectiveIds[0]!],
    });
  } else {
    rawItems.push({
      kind: "concept",
      title: `Core Concept: Fundamentals of ${title}`,
      description: "Foundational conceptual explanation and key definitions.",
      sourceBlockIds: [b0],
      objectiveIds,
    });
    rawItems.push({
      kind: "concept",
      title: `Primary Mechanisms of ${title}`,
      description:
        "Step-by-step examination of the underlying scientific process.",
      sourceBlockIds: [b1],
      objectiveIds,
    });
    rawItems.push({
      kind: "concept",
      title: `System Dynamics & Interactions`,
      description:
        "Detailed analysis of how components interact and regulate the system.",
      sourceBlockIds: [b2],
      objectiveIds,
    });
    rawItems.push({
      kind: "example",
      title: `Real-World Case Study`,
      description: "In-depth case study demonstrating core behaviors.",
      sourceBlockIds: [b1],
      objectiveIds: [objectiveIds[1] ?? objectiveIds[0]!],
    });
    rawItems.push({
      kind: "example",
      title: `Applied Problem Solving`,
      description: "Walkthrough of practical problems and observable data.",
      sourceBlockIds: [b2],
      objectiveIds: [objectiveIds[2] ?? objectiveIds[0]!],
    });
    rawItems.push({
      kind: "concept",
      title: `Advanced Implications & Insights`,
      description:
        "Synthesizing broader implications and real-world significance.",
      sourceBlockIds: [b0],
      objectiveIds,
    });
  }

  if (includeRecall) {
    rawItems.push({
      kind: "recall_question",
      title: "Knowledge Check",
      description: "Quick formative assessment check on core concepts.",
      sourceBlockIds: [b2],
      objectiveIds: [objectiveIds[0]!],
    });
  }

  rawItems.push({
    kind: "summary",
    title: "Conclusion & Key Takeaways",
    description: "Recap the essential lessons and review main findings.",
    sourceBlockIds: [b1],
    objectiveIds,
  });

  const count = rawItems.length;
  const baseSec = Math.floor(duration / count);
  const durations = rawItems.map(() => baseSec);
  let curSum = durations.reduce((a, b) => a + b, 0);
  for (let i = 0; curSum < duration; i++) {
    durations[i % count]! += 1;
    curSum += 1;
  }

  const items = rawItems.map((item, idx) => ({
    ...item,
    estimatedSeconds: durations[idx]!,
  }));

  const output = {
    schemaVersion: "outline-v1",
    targetDurationSeconds: duration,
    items,
  };

  return JSON.stringify(output);
}

function generateNarrationJson(text: string, allUuids: string[]): string {
  const blockIds = extractBlockIds(text);
  const fallbackBlocks =
    blockIds.length > 0
      ? blockIds
      : allUuids.length > 0
        ? allUuids.slice(0, 3)
        : ["019ffbf1-2222-7000-8000-000000000001"];

  // 1. Try to extract outline items with budgets from `wordBudgets` JSON or `outline` JSON
  let outlineItems: Array<{
    outlineItemId: string;
    estimatedSeconds: number;
    targetWords: number;
  }> = [];

  const parsedBudgets = extractJsonArray(text, "Per-item target word budgets");
  if (parsedBudgets && parsedBudgets.length > 0) {
    outlineItems = parsedBudgets.map((item) => ({
      outlineItemId: String(item["outlineItemId"] || item["id"]),
      estimatedSeconds: Number(item["estimatedSeconds"]) || 30,
      targetWords:
        Number(
          (item["budget"] as Record<string, unknown> | undefined)?.["target"],
        ) ||
        Math.round(((Number(item["estimatedSeconds"]) || 30) / 60) * 140 * 0.8),
    }));
  }

  if (outlineItems.length === 0) {
    const parsedOutline = extractJsonArray(
      text,
      "Approved outline items to narrate",
    );
    if (parsedOutline && parsedOutline.length > 0) {
      outlineItems = parsedOutline.map((item) => {
        const sec = Number(item["estimatedSeconds"]) || 30;
        return {
          outlineItemId: String(item["id"] || item["outlineItemId"]),
          estimatedSeconds: sec,
          targetWords: Math.round((sec / 60) * 140 * 0.8),
        };
      });
    }
  }

  if (outlineItems.length === 0) {
    const outlineIdMatches = text.match(/"outlineItemId":\s*"([^"]+)"/g);
    if (outlineIdMatches) {
      const ids = [
        ...new Set(
          outlineIdMatches
            .map((m) => {
              const res = /"outlineItemId":\s*"([^"]+)"/.exec(m);
              return res ? res[1] : null;
            })
            .filter((id): id is string => typeof id === "string"),
        ),
      ];
      outlineItems = ids.map((id) => ({
        outlineItemId: id,
        estimatedSeconds: 30,
        targetWords: 56,
      }));
    }
  }

  if (outlineItems.length === 0) {
    outlineItems = (
      allUuids.length > 0
        ? allUuids.slice(0, 3)
        : ["019ffbf1-1111-7000-8000-000000000001"]
    ).map((id) => ({
      outlineItemId: id,
      estimatedSeconds: 30,
      targetWords: 56,
    }));
  }

  let duration = extractTargetDuration(text);
  const totalOutlineSeconds = outlineItems.reduce(
    (sum, item) => sum + item.estimatedSeconds,
    0,
  );
  if ([180, 300, 420].includes(totalOutlineSeconds)) {
    duration = totalOutlineSeconds;
  }

  const title = extractLessonTitle(text);

  const blocks = outlineItems.map((item, idx) => {
    const srcBlock = fallbackBlocks[idx % fallbackBlocks.length]!;
    const sentences = generateSentencesForBlock(
      item.targetWords,
      srcBlock,
      idx,
      title,
    );
    return {
      outlineItemId: item.outlineItemId,
      sentences,
    };
  });

  const output = {
    schemaVersion: "narration-v1",
    targetDurationSeconds: duration,
    blocks,
  };

  return JSON.stringify(output);
}

function generateNarrationBlockTransformJson(
  text: string,
  allUuids: string[],
): string {
  const blockIds = extractBlockIds(text);
  const fallbackBlocks =
    blockIds.length > 0
      ? blockIds
      : allUuids.length > 0
        ? allUuids.slice(0, 3)
        : ["019ffbf1-2222-7000-8000-000000000001"];

  const modeMatch = text.match(
    /"mode":\s*"(simplify|shorten|expand|adjust_tone)"/,
  );
  const mode = (modeMatch ? modeMatch[1] : "simplify") as
    "simplify" | "shorten" | "expand" | "adjust_tone";

  const outlineItemMatch = text.match(/"outlineItemId":\s*"([^"]+)"/);
  const outlineItemId = outlineItemMatch
    ? outlineItemMatch[1]!
    : (allUuids[0] ?? "019ffbf1-1111-7000-8000-000000000001");

  const minMatch = text.match(/"min":\s*(\d+)/);
  const maxMatch = text.match(/"max":\s*(\d+)/);
  const targetMatch = text.match(/"target":\s*(\d+)/);
  const currentWordsMatch = text.match(/"currentWords":\s*(\d+)/);

  const minWords = minMatch ? parseInt(minMatch[1]!, 10) : 40;
  const maxWords = maxMatch ? parseInt(maxMatch[1]!, 10) : 70;
  const currentWords = currentWordsMatch
    ? parseInt(currentWordsMatch[1]!, 10)
    : 55;

  let targetWords = targetMatch
    ? parseInt(targetMatch[1]!, 10)
    : Math.round((minWords + maxWords) / 2);
  if (mode === "shorten") {
    targetWords = Math.max(minWords, Math.min(currentWords - 5, targetWords));
    if (targetWords >= currentWords)
      targetWords = Math.max(minWords, currentWords - 1);
  } else if (mode === "expand") {
    targetWords = Math.min(maxWords, Math.max(currentWords + 5, targetWords));
    if (targetWords <= currentWords)
      targetWords = Math.min(maxWords, currentWords + 1);
  }

  const srcBlock = fallbackBlocks[0]!;
  const sentences = generateSentencesForBlock(
    targetWords,
    srcBlock,
    0,
    "Educational Topic",
  );

  const output = {
    schemaVersion: "narration-block-v1",
    mode,
    block: {
      outlineItemId,
      sentences,
    },
  };

  return JSON.stringify(output);
}

function generateStoryboardJson(text: string, allUuids: string[]): string {
  const blockIds = extractBlockIds(text);
  const fallbackBlocks =
    blockIds.length > 0
      ? blockIds
      : allUuids.length > 0
        ? allUuids.slice(0, 3)
        : ["019ffbf1-2222-7000-8000-000000000001"];

  let narrationBlockIds: string[] = [];
  const parsedNarration = extractJsonArray(text, "Approved narration blocks");
  if (parsedNarration && parsedNarration.length > 0) {
    narrationBlockIds = parsedNarration.map((item) =>
      String(item["id"] || item["narrationBlockId"]),
    );
  }

  if (narrationBlockIds.length === 0) {
    const narrationMatches = text.match(/"narrationBlockId":\s*"([^"]+)"/g);
    if (narrationMatches) {
      narrationBlockIds = narrationMatches
        .map((m) => {
          const res = /"narrationBlockId":\s*"([^"]+)"/.exec(m);
          return res ? res[1] : null;
        })
        .filter((id): id is string => typeof id === "string");
    }
  }

  if (narrationBlockIds.length === 0) {
    narrationBlockIds =
      allUuids.length > 0
        ? allUuids.slice(0, 3)
        : ["019ffbf1-3333-7000-8000-000000000001"];
  }

  narrationBlockIds = [...new Set(narrationBlockIds)];

  const duration = extractTargetDuration(text);
  const title = extractLessonTitle(text);
  const b0 = fallbackBlocks[0]!;
  const b1 = fallbackBlocks[1] ?? b0;

  // The scenes must partition the approved narration exactly (a deterministic
  // storyboard-check requirement), so there can never be more scenes than
  // narration blocks. Within that ceiling the count also has to leave the
  // target duration reachable: every scene lasts 3-60s, so the target needs at
  // least ceil(target / 60) scenes and at most floor(target / 3). Blocks are
  // grouped in order when there are more of them than the duration allows.
  const maximumScenes = Math.min(
    STORYBOARD_SCENE_COUNT_MAX,
    Math.floor(duration / STORYBOARD_SCENE_MIN_SECONDS),
  );
  const sceneCount = Math.max(
    Math.min(STORYBOARD_SCENE_COUNT_MIN, narrationBlockIds.length),
    Math.min(narrationBlockIds.length, maximumScenes),
  );
  const sceneBlocks: string[][] = groupNarrationBlocks(
    narrationBlockIds,
    sceneCount,
  );

  const base = Math.max(
    STORYBOARD_SCENE_MIN_SECONDS,
    Math.min(
      STORYBOARD_SCENE_MAX_SECONDS,
      Math.floor(duration / Math.max(1, sceneCount)),
    ),
  );
  const sceneDurations = sceneBlocks.map(() => base);
  let curSum = sceneDurations.reduce((a, b) => a + b, 0);
  const guardLimit = sceneDurations.length * STORYBOARD_SCENE_MAX_SECONDS + 1;
  for (let i = 0; curSum < duration && i < guardLimit; i++) {
    const idx = i % sceneDurations.length;
    if (sceneDurations[idx]! < STORYBOARD_SCENE_MAX_SECONDS) {
      sceneDurations[idx]! += 1;
      curSum += 1;
    }
  }
  for (let i = 0; curSum > duration && i < guardLimit; i++) {
    const idx = i % sceneDurations.length;
    if (sceneDurations[idx]! > STORYBOARD_SCENE_MIN_SECONDS) {
      sceneDurations[idx]! -= 1;
      curSum -= 1;
    }
  }

  const scenes = sceneBlocks.map((blocks, idx) => {
    const isFirst = idx === 0;
    const isLast = idx === sceneBlocks.length - 1;
    const isMid = !isFirst && !isLast;
    const estimatedSeconds = sceneDurations[idx]!;
    const common = {
      narrationBlockIds: blocks,
      estimatedSeconds,
      transition: (isMid ? "cut" : "fade") as "cut" | "fade",
      generatedAdditions: [] as unknown[],
      assetRequirements: [] as unknown[],
    };

    if (isFirst) {
      return {
        ...common,
        template: "hook" as const,
        title: clampText(`Introduction: ${title}`, 160),
        onScreenText: [clampText(title, 120)],
        sourceBlockIds: [b0],
        visual: {
          question: clampText(`Why does ${title} matter?`, 80),
        },
      };
    }
    if (isMid) {
      return {
        ...common,
        template: "definition" as const,
        title: clampText(`Key concept ${idx}`, 160),
        onScreenText: ["Core concept", "Key principles"],
        sourceBlockIds: [b1],
        visual: {
          term: clampText(`Key concept ${idx}`, 80),
          definition: clampText(
            `A core idea behind ${title} and how it shapes what we observe.`,
            120,
          ),
        },
      };
    }
    return {
      ...common,
      template: "summary" as const,
      title: "Lesson summary",
      onScreenText: ["Summary", "Key takeaways"],
      sourceBlockIds: [b0],
      visual: {
        takeaways: [
          { text: clampText(`Understand the core ideas of ${title}.`, 140) },
          { text: "Identify how the key parts work together." },
        ],
        callToAction: "Review the concepts and check your understanding.",
      },
    };
  });

  const output = {
    schemaVersion: "storyboard-v1",
    targetDurationSeconds: duration,
    scenes,
  };

  return JSON.stringify(output);
}

function generateSceneRegenerationJson(
  text: string,
  allUuids: string[],
): string {
  const blockIds = extractBlockIds(text);
  const fallbackBlocks =
    blockIds.length > 0
      ? blockIds
      : allUuids.length > 0
        ? allUuids.slice(0, 3)
        : ["019ffbf1-2222-7000-8000-000000000001"];

  const b0 = fallbackBlocks[0]!;

  // The output mode must be one of the supported scene-regeneration modes.
  const modeMatch = text.match(
    /Regeneration mode:\s*(improve-visual|simplify|shorten|regenerate)/,
  );
  const mode = (modeMatch ? modeMatch[1] : "improve-visual") as
    "improve-visual" | "simplify" | "shorten" | "regenerate";

  // The regenerated scene must keep the current scene's narration assignment.
  const currentScene = extractJsonObject<Record<string, unknown>>(
    text,
    "Current scene",
  );
  let narrationBlockIds: string[] = [];
  const rawIds = currentScene?.["narrationBlockIds"];
  if (Array.isArray(rawIds))
    narrationBlockIds = rawIds.filter(
      (id): id is string => typeof id === "string",
    );
  if (narrationBlockIds.length === 0) {
    const idMatch = text.match(/"narrationBlockIds":\s*\[\s*"([^"]+)"/);
    if (idMatch) narrationBlockIds = [idMatch[1]!];
  }
  if (narrationBlockIds.length === 0)
    narrationBlockIds = [allUuids[0] ?? "019ffbf1-3333-7000-8000-000000000001"];

  const output = {
    schemaVersion: "scene-regeneration-v1",
    mode,
    scene: {
      template: "definition" as const,
      title: "Core mechanism",
      narrationBlockIds,
      onScreenText: ["Refined concept", "Key step"],
      estimatedSeconds: 30,
      transition: "fade" as const,
      sourceBlockIds: [b0],
      generatedAdditions: [],
      assetRequirements: [],
      visual: {
        term: "Core mechanism",
        definition: clampText(
          "An updated, clearer explanation of the core scientific process.",
          120,
        ),
      },
    },
  };

  return JSON.stringify(output);
}

/**
 * Extracts the rendered `claims` prompt variable. Scanning for the matching
 * bracket keeps claim text containing brackets or escaped quotes intact, which
 * a non-greedy regex over the whole prompt would truncate.
 */
function extractClaimSummaries(
  text: string,
): { id: string; text: string; generatedAddition?: unknown }[] {
  const start = text.indexOf('[{"id":"');
  if (start === -1) return [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    const character = text[index]!;
    if (escaped) escaped = false;
    else if (character === "\\") escaped = true;
    else if (character === '"') inString = !inString;
    else if (!inString && (character === "[" || character === "{")) depth++;
    else if (!inString && (character === "]" || character === "}")) {
      depth--;
      if (depth === 0) {
        try {
          const parsed: unknown = JSON.parse(text.slice(start, index + 1));
          return Array.isArray(parsed)
            ? (parsed as { id: string; text: string }[])
            : [];
        } catch {
          return [];
        }
      }
    }
  }
  return [];
}

/**
 * Answers every claim the operation context asked about, in the shape the
 * grounding job's deterministic checks require: exactly one result per claim,
 * spans inside the claim text, a real source block behind each supported span,
 * and `generated_addition` for the claims that carry no source refs.
 */
function generateGroundingCheckJson(text: string, allUuids: string[]): string {
  const blockIds = extractBlockIds(text);
  const sourceBlockId =
    blockIds[0] ?? allUuids[0] ?? "019ffbf1-2222-7000-8000-000000000001";
  const claims = extractClaimSummaries(text);

  const results = claims.map((claim) => {
    const base = {
      schemaVersion: "grounding-claim-v1",
      claimId: claim.id,
      unsupportedSpans: [],
    };
    // A claim carries either sourceRefs or a generatedAddition, never both, and
    // the job rejects any other pairing of status and provenance.
    if (claim.generatedAddition !== undefined)
      return { ...base, status: "generated_addition", supportedSpans: [] };
    return {
      ...base,
      status: "supported",
      supportedSpans: [
        {
          start: 0,
          end: Math.max(1, (claim.text ?? "").length),
          sourceBlockId,
        },
      ],
    };
  });

  return JSON.stringify({ schemaVersion: "grounding-v1", results });
}

/**
 * Intelligent in-process mock LLM provider for local development.
 * Automatically generates grounded, schema-compliant JSON for:
 * - objectives-v1
 * - outline-v1
 * - narration-v1
 * - narration-block-v1
 * - storyboard-v1
 * - scene-regeneration-v1
 * - grounding-claim-v1
 */
export class DynamicMockLanguageModelProvider implements LanguageModelProvider {
  public readonly providerId = "dynamic-mock";
  public readonly requests: ProviderCompletionRequest[] = [];
  public readonly completions: string[] = [];

  public async complete(
    request: ProviderCompletionRequest,
  ): Promise<ProviderCompletionResponse> {
    this.requests.push(request);
    const fullText = request.messages.map((m) => m.content).join("\n\n");
    const allUuids = extractAllUuids(fullText);

    // Route on the operation's own system prompt, not on loose keywords in the
    // rendered user text. The storyboard/scene-regeneration prompts embed the
    // full ten-template catalog, whose descriptions contain words like
    // "transform" and "outline" that otherwise misroute the request.
    const systemText =
      request.messages.find((m) => m.role === "system")?.content ?? fullText;

    let jsonOutput: string;

    if (systemText.includes("rewrites ONE narration block")) {
      jsonOutput = generateNarrationBlockTransformJson(fullText, allUuids);
    } else if (systemText.includes("storyboard scene editor")) {
      jsonOutput = generateSceneRegenerationJson(fullText, allUuids);
    } else if (systemText.includes("storyboard planner")) {
      jsonOutput = generateStoryboardJson(fullText, allUuids);
    } else if (systemText.includes("source-grounding judge")) {
      jsonOutput = generateGroundingCheckJson(fullText, allUuids);
    } else if (systemText.includes("instructional designer")) {
      jsonOutput = generateObjectivesJson(fullText, allUuids);
    } else if (systemText.includes("instructional planner")) {
      jsonOutput = generateOutlineJson(fullText, allUuids);
    } else if (systemText.includes("science narrator")) {
      jsonOutput = generateNarrationJson(fullText, allUuids);
    } else if (
      fullText.includes("scene-regeneration-v1") ||
      fullText.includes("regenerate one scene")
    ) {
      jsonOutput = generateSceneRegenerationJson(fullText, allUuids);
    } else if (
      fullText.includes("storyboard-v1") ||
      fullText.includes("LessonSpec storyboard")
    ) {
      jsonOutput = generateStoryboardJson(fullText, allUuids);
    } else if (
      fullText.includes("narration-block-v1") ||
      fullText.includes("Rewrite exactly one narration block")
    ) {
      jsonOutput = generateNarrationBlockTransformJson(fullText, allUuids);
    } else if (
      fullText.includes("objectives-v1") ||
      fullText.includes("measurable learning objectives")
    ) {
      jsonOutput = generateObjectivesJson(fullText, allUuids);
    } else if (
      fullText.includes("narration-v1") ||
      fullText.includes("spoken narration") ||
      fullText.includes("Approved outline items to narrate")
    ) {
      jsonOutput = generateNarrationJson(fullText, allUuids);
    } else if (
      fullText.includes("outline-v1") ||
      fullText.includes("lesson outline")
    ) {
      jsonOutput = generateOutlineJson(fullText, allUuids);
    } else if (fullText.includes("grounding") || fullText.includes("claimId")) {
      jsonOutput = generateGroundingCheckJson(fullText, allUuids);
    } else {
      jsonOutput = "{}";
    }

    this.completions.push(jsonOutput);

    return providerCompletionResponseSchema.parse({
      providerId: this.providerId,
      model: request.model,
      text: jsonOutput,
      finishReason: "stop",
      usage: { inputTokens: 250, outputTokens: 500 },
      latencyMs: 50,
      retries: 0,
    });
  }
}
