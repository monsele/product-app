import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { customFixtureManifest } from "./custom-design.fixture.js";
import {
  assertCustomGlyphs,
  resolveCustomIdentity,
  verifiedCustomBytes,
} from "./custom-design.js";
import {
  CinemaBeatProvider,
  createBeatTimeline,
  useCinemaBeats,
} from "./cinema/beats.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

afterEach(() => vi.unstubAllGlobals());
describe("ST-123 pinned imports and bounded motion", () => {
  it("honours the selected entrance family in the actual composition context", () => {
    const Probe = () =>
      createElement("div", { style: useCinemaBeats().arrival(0.5) });
    const render = (family: "fade" | "settle") =>
      renderToStaticMarkup(
        createElement(CinemaBeatProvider, {
          timeline: createBeatTimeline({
            beats: [],
            frames: [],
            frame: 6,
            durationInFrames: 300,
            energy: "balanced",
            customMotion: { family, holdFrames: 36, staggerFrames: 0 },
          }),
          children: createElement(Probe),
        }),
      );
    expect(render("fade")).toContain("transform:none");
    expect(render("settle")).toContain("translateY(14px)");
  });
  it("loads byte-identical media and rejects unavailable or changed imports", async () => {
    const bytes = new TextEncoder().encode("immutable import");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(bytes)),
    );
    expect(
      new Uint8Array(
        await verifiedCustomBytes("https://private.example/file", checksum),
      ),
    ).toEqual(bytes);
    await expect(
      verifiedCustomBytes("https://private.example/file", "b".repeat(64)),
    ).rejects.toThrow(/different bytes/);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    await expect(
      verifiedCustomBytes("https://private.example/file", checksum),
    ).rejects.toThrow(/unavailable/);
  });
  it("fails missing glyphs with codepoints and keeps native identities independent", () => {
    const manifest = customFixtureManifest("journal", "a".repeat(64));
    expect(() =>
      assertCustomGlyphs(manifest, "Readable English 123"),
    ).not.toThrow();
    expect(() => assertCustomGlyphs(manifest, "漢")).toThrow(/U\+6F22/);
    const identity = resolveCustomIdentity(manifest);
    expect(identity.packId).toBe("custom");
    expect(identity.fonts.display).toContain("a".repeat(64));
    expect(identity.customAlignment).toBe("left");
  });
  it("caps staggered reveals before the requested readable hold", () => {
    const manifest = customFixtureManifest("signal", "a".repeat(64));
    const design = Object.values(manifest.scenes)[0]!;
    const timeline = createBeatTimeline({
      beats: design.beats,
      frames: design.beats.map(() => 295),
      frame: 300,
      durationInFrames: 300,
      energy: "calm",
      customMotion: { family: "fade", staggerFrames: 12, holdFrames: 90 },
    });
    expect(Math.max(...timeline.starts.values())).toBeLessThanOrEqual(
      300 - 90 - 26,
    );
    expect(timeline.durationInFrames).toBe(300);
  });
  it("checks a text run against its assigned font instead of every font", () => {
    const manifest = customFixtureManifest("journal", "a".repeat(64));
    const headingId = "00000000-0000-7000-8000-000000000999";
    manifest.presentation.fonts.heading = headingId;
    manifest.fonts.push({
      assetId: headingId,
      sha256: "b".repeat(64),
      characterSet: [..."Heading"].map((char) => char.codePointAt(0)!),
    });
    expect(() =>
      assertCustomGlyphs(manifest, "Heading", headingId),
    ).not.toThrow();
    expect(() => assertCustomGlyphs(manifest, "Body only 123")).not.toThrow();
    expect(() => assertCustomGlyphs(manifest, "123", headingId)).toThrow(
      /U\+31/,
    );
    expect(() => assertCustomGlyphs(manifest, "123", "missing-font")).toThrow(
      /not pinned/,
    );
  });
});
