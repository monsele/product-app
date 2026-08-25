import { describe, expect, it } from "vitest";
import { reorderSceneIds, sceneRowHeight, visibleSceneRange } from "./scene-list";

describe("reorderSceneIds", () => {
  const ids = ["a", "b", "c", "d"];

  it("moves a scene later in the list", () => {
    expect(reorderSceneIds(ids, 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves a scene earlier in the list", () => {
    expect(reorderSceneIds(ids, 3, 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("keeps the original order when indices are equal", () => {
    expect(reorderSceneIds(ids, 1, 1)).toEqual(ids);
  });

  it("keeps the original order for out-of-range indices", () => {
    expect(reorderSceneIds(ids, -1, 2)).toEqual(ids);
    expect(reorderSceneIds(ids, 0, 99)).toEqual(ids);
  });

  it("does not mutate the input array", () => {
    const input = ["a", "b", "c"];
    reorderSceneIds(input, 0, 2);
    expect(input).toEqual(["a", "b", "c"]);
  });
});

describe("visibleSceneRange", () => {
  it("renders the first window from the top of a large list", () => {
    const range = visibleSceneRange(100, 0, 480);
    expect(range.start).toBe(0);
    expect(range.end).toBeGreaterThan(0);
    expect(range.end).toBeLessThan(30);
    expect(range.end).toBeLessThanOrEqual(100);
  });

  it("starts the window above the viewport to include overscan rows", () => {
    const scrollTop = 50 * sceneRowHeight;
    const range = visibleSceneRange(100, scrollTop, 480);
    expect(range.start).toBeLessThan(50);
    expect(range.start).toBeGreaterThanOrEqual(40);
    expect(range.end).toBeGreaterThan(50);
  });

  it("clamps the end at the scene count near the bottom", () => {
    const scrollTop = 99 * sceneRowHeight;
    const range = visibleSceneRange(100, scrollTop, 480);
    expect(range.start).toBeGreaterThan(80);
    expect(range.end).toBe(100);
  });

  it("never starts below the first scene", () => {
    const range = visibleSceneRange(100, -50, 480);
    expect(range.start).toBe(0);
  });

  it("renders every scene when the list is smaller than one window", () => {
    expect(visibleSceneRange(2, 0, 480)).toEqual({ start: 0, end: 2 });
  });

  it("keeps a usable window when the viewport height is unknown", () => {
    const range = visibleSceneRange(100, 0, 0);
    expect(range.start).toBe(0);
    expect(range.end).toBeGreaterThanOrEqual(12);
  });

  it("returns an empty window for an empty list", () => {
    expect(visibleSceneRange(0, 0, 480)).toEqual({ start: 0, end: 0 });
  });
});
