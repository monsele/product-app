import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TeacherAssetPicker } from "./teacher-asset-picker";

describe("TeacherAssetPicker", () => {
  it("renders the project-private image upload control with MVP type limits", () => {
    const html = renderToStaticMarkup(
      <TeacherAssetPicker
        projectId="019ffbf1-610e-738a-b087-6775ff97568c"
        disabled={false}
        selectedId=""
        slot="diagram"
        onChange={() => undefined}
      />,
    );

    expect(html).toContain("Upload PNG, JPEG, or WebP");
    expect(html).toContain(
      'accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"',
    );
    expect(html).toContain("Remove replacement (choose a suggested asset)");
    expect(html).toContain("Remove selected uploaded image");
  });
});
