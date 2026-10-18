import { describe, expect, it } from "vitest";
import { mergeEditorRefresh } from "./merge-editor-refresh";
describe("editor background refresh", () => {
  const base = {
    narration: "Original",
    durationSeconds: 30,
    visual: { title: "Before" },
    items: ["one", "two"],
  };
  it("keeps typed narration while applying measured timing and unrelated visual updates", () => {
    const result = mergeEditorRefresh(
      base,
      { ...base, narration: "Unsaved teacher words" },
      { ...base, durationSeconds: 42, visual: { title: "New" } },
    );
    expect(result).toEqual({
      value: {
        ...base,
        narration: "Unsaved teacher words",
        durationSeconds: 42,
        visual: { title: "New" },
      },
      conflicts: [],
    });
  });
  it("retains local conflicting fields for explicit review instead of silently overwriting either edit", () => {
    expect(
      mergeEditorRefresh(
        base,
        { ...base, narration: "Mine", items: ["two", "one"] },
        { ...base, narration: "Other tab", items: ["new"] },
      ),
    ).toMatchObject({
      value: { narration: "Mine", items: ["two", "one"] },
      conflicts: ["narration", "items"],
    });
  });
  it("treats an identical refresh as no change to local values", () => {
    const local = { ...base, narration: "Still typing" };
    expect(
      mergeEditorRefresh(base, local, globalThis.structuredClone(base)).value,
    ).toBe(local);
  });
});
