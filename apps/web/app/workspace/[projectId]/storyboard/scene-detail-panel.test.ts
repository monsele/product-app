import type {
  ProjectAsset,
  StoryboardSceneDetailResponse,
} from "@avlp/schemas";
import { describe, expect, it } from "vitest";
import { teacherReplacementPreviewForScene } from "./scene-detail-panel";

const teacherAsset: ProjectAsset = {
  assetId: "019ffbf1-a001-7000-8000-000000000001",
  createdAt: "2026-08-23T12:00:00.000Z",
  height: 100,
  mediaType: "image/png",
  previewUrl: "https://storage.example.test/teacher-preview",
  provenance: "teacher_uploaded",
  width: 200,
};

describe("teacherReplacementPreviewForScene", () => {
  it("uses the private replacement preview when the scene binds that asset", () => {
    const detail = {
      scene: {
        scene: {
          assetBindings: [
            {
              assetId: teacherAsset.assetId,
              role: "illustration",
              slot: "diagram",
            },
          ],
        },
      },
    } as StoryboardSceneDetailResponse;

    expect(teacherReplacementPreviewForScene(detail, [teacherAsset])).toBe(
      teacherAsset,
    );
  });
});
