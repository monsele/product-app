import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  mvpHappyPathEvidence,
  mvpRecoveryScenarios,
  unchangedArtifactReuse,
} from "./mvp-acceptance.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const readRepositoryFile = (path: string) =>
  readFileSync(resolve(repositoryRoot, path), "utf8");

describe("MVP release traceability", () => {
  it("maps every PRD user story into the traceability matrix", () => {
    const prd = readRepositoryFile("docs/reference/mvp-prd.md");
    const matrix = readRepositoryFile("TRACEABILITY_MATRIX.md");
    const userStoryIds = [...prd.matchAll(/User Story (E\d+-US\d+)/g)].map(
      (match) => match[1]!,
    );

    expect(userStoryIds.length).toBeGreaterThan(20);
    expect(new Set(userStoryIds).size).toBe(userStoryIds.length);
    expect(userStoryIds.filter((id) => !matrix.includes(id))).toEqual([]);
  });

  it("keeps every linked story file present", () => {
    const matrix = readRepositoryFile("TRACEABILITY_MATRIX.md");
    const storyPaths = [...matrix.matchAll(/\((stories\/[^)]+\.md)\)/g)].map(
      (match) => match[1]!,
    );
    expect(storyPaths.length).toBeGreaterThan(20);
    expect(
      storyPaths.filter((path) => !existsSync(resolve(repositoryRoot, path))),
    ).toEqual([]);
  });

  it("keeps executable evidence attached to every happy-path stage", () => {
    for (const [stage, paths] of Object.entries(mvpHappyPathEvidence)) {
      expect(paths.length, `${stage} has evidence`).toBeGreaterThan(0);
      for (const path of paths) {
        expect(existsSync(resolve(repositoryRoot, path)), path).toBe(true);
        expect(readRepositoryFile(path), path).toMatch(/\b(?:it|test)\s*\(/);
      }
    }
  });

  it("keeps executable evidence attached to every recovery scenario", () => {
    for (const scenario of mvpRecoveryScenarios)
      for (const path of scenario.evidence) {
        expect(existsSync(resolve(repositoryRoot, path)), path).toBe(true);
        expect(readRepositoryFile(path), path).toMatch(/\b(?:it|test)\s*\(/);
      }
  });

  it("keeps executable evidence attached to every unchanged-content reuse gate", () => {
    for (const check of unchangedArtifactReuse) {
      expect(
        existsSync(resolve(repositoryRoot, check.evidence)),
        check.evidence,
      ).toBe(true);
      expect(readRepositoryFile(check.evidence), check.evidence).toMatch(
        /\b(?:it|test)\s*\(/,
      );
    }
  });

  it("keeps ST-071 reviewable only after all declared dependencies are Done", () => {
    const story = readRepositoryFile(
      "stories/07-mvp-release/ST-071-complete-end-to-end-mvp-acceptance-security-cost-and-recovery-hardening.md",
    );
    const index = readRepositoryFile("STORY_INDEX.md");
    const dependencies =
      story.match(/depends_on:\s*\[([\s\S]*?)\]/)?.[1]?.match(/ST-\d{3}/g) ??
      [];

    expect(dependencies.length).toBeGreaterThan(0);
    const indexRows = index.split(/\r?\n/);
    for (const dependency of dependencies) {
      const row = indexRows.find((line) => line.includes(`[${dependency} `));
      expect(row, `${dependency} is present in STORY_INDEX.md`).toBeDefined();
      expect(row).toMatch(/\|\s*Done\s*\|$/);
    }
    const releaseRow = indexRows.find((line) => line.includes("[ST-071 "));
    expect(releaseRow).toMatch(/\|\s*(In Progress|In Review|Done)\s*\|$/);
  });
});
