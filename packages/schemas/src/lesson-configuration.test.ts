import { describe, expect, it } from "vitest";
import {
  lessonConfigurationInputSchema,
  lessonConfigurationSchema,
  narrationPauseReservation,
  narrationWordCountRange,
  narrationWordsPerMinute,
  targetDurationSecondsSchema,
} from "./index.js";

const validInput = {
  expectedVersion: 0,
  ageBand: "11-13",
  difficulty: "introductory",
  subject: "Biology",
  lessonTitle: "The Water Cycle",
  targetDurationSeconds: 300,
  tone: "friendly",
  includeRecallQuestions: true,
};

describe("lesson configuration schemas", () => {
  it("accepts a complete configuration input", () => {
    const result = lessonConfigurationInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects a missing required field", () => {
    const missing: Record<string, unknown> = { ...validInput };
    delete missing.subject;
    const result = lessonConfigurationInputSchema.safeParse(missing);
    expect(result.success).toBe(false);
  });

  it("rejects unsupported enum values", () => {
    expect(
      lessonConfigurationInputSchema.safeParse({
        ...validInput,
        ageBand: "2-4",
      }).success,
    ).toBe(false);
    expect(
      lessonConfigurationInputSchema.safeParse({
        ...validInput,
        difficulty: "expert",
      }).success,
    ).toBe(false);
    expect(
      lessonConfigurationInputSchema.safeParse({
        ...validInput,
        tone: "technical",
      }).success,
    ).toBe(false);
  });

  it("rejects a non-MVP duration", () => {
    expect(
      lessonConfigurationInputSchema.safeParse({
        ...validInput,
        targetDurationSeconds: 240,
      }).success,
    ).toBe(false);
  });

  it("rejects negative expected version", () => {
    expect(
      lessonConfigurationInputSchema.safeParse({
        ...validInput,
        expectedVersion: -1,
      }).success,
    ).toBe(false);
  });

  it("trims and bounds free text fields", () => {
    expect(
      lessonConfigurationInputSchema.safeParse({
        ...validInput,
        subject: "",
      }).success,
    ).toBe(false);
    expect(
      lessonConfigurationInputSchema.safeParse({
        ...validInput,
        lessonTitle: "x".repeat(201),
      }).success,
    ).toBe(false);
  });

  it("validates a persisted configuration shape", () => {
    const result = lessonConfigurationSchema.safeParse({
      version: 2,
      ageBand: "11-13",
      difficulty: "introductory",
      subject: "Biology",
      lessonTitle: "The Water Cycle",
      targetDurationSeconds: 300,
      tone: "friendly",
      visualTheme: "mvp-default",
      includeRecallQuestions: true,
      sourceParsedDocumentVersion: 3,
      updatedAt: "2026-08-16T12:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});

describe("target duration mapping", () => {
  it("only allows 3, 5, and 7 minute lessons", () => {
    for (const seconds of [180, 300, 420])
      expect(targetDurationSecondsSchema.safeParse(seconds).success).toBe(true);
    for (const seconds of [0, 240, 600])
      expect(targetDurationSecondsSchema.safeParse(seconds).success).toBe(false);
  });
});

describe("narration word-count targets", () => {
  it("produces the documented midpoint for each duration", () => {
    const durationTargets: Readonly<Record<number, number>> = {
      180: Math.round(
        3 * narrationWordsPerMinute * (1 - narrationPauseReservation),
      ),
      300: Math.round(
        5 * narrationWordsPerMinute * (1 - narrationPauseReservation),
      ),
      420: Math.round(
        7 * narrationWordsPerMinute * (1 - narrationPauseReservation),
      ),
    };
    for (const [duration, target] of Object.entries(durationTargets)) {
      const range = narrationWordCountRange(Number(duration));
      expect(range.target).toBe(target);
      expect(range.min).toBeLessThanOrEqual(range.target);
      expect(range.max).toBeGreaterThanOrEqual(range.target);
    }
  });

  it("produces strictly increasing ranges for longer lessons", () => {
    const three = narrationWordCountRange(180);
    const five = narrationWordCountRange(300);
    const seven = narrationWordCountRange(420);
    expect(three.max).toBeLessThan(five.min);
    expect(five.max).toBeLessThan(seven.min);
  });

  it("always returns a positive minimum", () => {
    expect(narrationWordCountRange(180).min).toBeGreaterThan(0);
    expect(narrationWordCountRange(420).min).toBeGreaterThan(0);
  });
});
