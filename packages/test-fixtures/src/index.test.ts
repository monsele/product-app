import { expect, it } from "vitest";
import { workspaceImportSmoke } from "./index.js";

it("imports a workspace package", () => {
  expect(workspaceImportSmoke()).toBe("schemas");
});
