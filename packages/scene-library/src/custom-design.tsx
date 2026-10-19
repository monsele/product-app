import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import { useDelayRender, useCurrentFrame } from "remotion";
import {
  customDesignManifestSchema,
  designSystemContentHash,
  type CustomDesignManifest,
  type SceneSpec,
} from "@avlp/schemas";
import { CinemaBeatProvider, createBeatTimeline } from "./cinema/beats.js";
import { cinemaCompositionComponents } from "./cinema/cinema-scene.js";
import { mixColor, type CinemaIdentity } from "./cinema/identity.js";
import {
  resolveCinemaHero,
  resolveCinemaItemIcons,
  resolveCinemaSubjectImages,
} from "./cinema/content.js";
import { resolveSceneChart } from "./data-chart/resolve.js";
import type { ResolvedSceneAsset } from "./scene-registry.js";

export type CustomDesignMedia = Readonly<
  Record<string, Readonly<{ url: string }>>
>;
export const customFontFamily = (hash: string) => `avlp-custom-${hash}`;

export function assertCustomGlyphs(
  manifest: CustomDesignManifest,
  text: string,
  assetId: string = manifest.presentation.fonts.body,
): void {
  const pin = manifest.fonts.find((font) => font.assetId === assetId);
  if (!pin)
    throw new Error(
      "The rendered font is not pinned. Choose a validated font and compile a new snapshot.",
    );
  const covered = new Set(pin.characterSet);
  const absent = [
    ...new Set(
      [...text].filter(
        (char) => !/\s/u.test(char) && !covered.has(char.codePointAt(0)!),
      ),
    ),
  ];
  if (absent.length)
    throw new Error(
      `The selected font lacks ${absent
        .slice(0, 12)
        .map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase()}`)
        .join(
          ", ",
        )}. Import a font covering this lesson and publish a new revision.`,
    );
}

/** Include native labels, badges and table cells, regardless of their tag. */
function customTextNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.textContent?.trim()) nodes.push(node);
  }
  return nodes;
}

export function assertCustomRenderedGlyphs(
  manifest: CustomDesignManifest,
  root: HTMLElement,
): void {
  const selection = window.getSelection();
  const savedRanges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) =>
        selection.getRangeAt(index).cloneRange(),
      )
    : [];
  const anchor = selection?.anchorNode;
  const focus = selection?.focusNode;
  const anchorOffset = selection?.anchorOffset ?? 0;
  const focusOffset = selection?.focusOffset ?? 0;
  let selectedText = false;
  try {
    for (const node of customTextNodes(root)) {
      const element = node.parentElement!;
      const computed = window.getComputedStyle(element);
      const family = computed.fontFamily
        .split(",")[0]!
        .trim()
        .replace(/^["']|["']$/g, "");
      const pin = manifest.fonts.find(
        (font) => customFontFamily(font.sha256) === family,
      );
      if (!pin)
        throw new Error(
          "Rendered text uses an unpinned font. Choose a validated font and compile a new snapshot.",
        );
      let text = node.textContent!;
      if (computed.textTransform !== "none") {
        if (!selection)
          throw new Error(
            "Rendered text could not be checked. Reload the preview before rendering.",
          );
        // Chromium's selection text includes CSS casing, language rules and word
        // context across inline nodes. Raw textContent does not. Temporarily allow
        // selection even inside a Player that disables it, without changing layout.
        const userSelect = element.style.getPropertyValue("user-select");
        const priority = element.style.getPropertyPriority("user-select");
        try {
          element.style.setProperty("user-select", "text", "important");
          const range = document.createRange();
          range.selectNodeContents(node);
          selectedText = true;
          selection.removeAllRanges();
          selection.addRange(range);
          text = selection.toString();
        } finally {
          if (userSelect)
            element.style.setProperty("user-select", userSelect, priority);
          else element.style.removeProperty("user-select");
        }
      }
      assertCustomGlyphs(manifest, text, pin.assetId);
    }
  } finally {
    if (selectedText && selection) {
      selection.removeAllRanges();
      for (const range of savedRanges) selection.addRange(range);
      if (savedRanges.length === 1 && anchor && focus)
        selection.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
    }
  }
}

export async function verifiedCustomBytes(
  url: string,
  expected: string,
): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(
      "A pinned design import is unavailable. Restore its bytes or publish a new revision.",
    );
  const bytes = await response.arrayBuffer();
  const digest = [
    ...new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes)),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  if (digest !== expected)
    throw new Error(
      "A pinned design import has different bytes. Restore the approved file; substitution is blocked.",
    );
  return bytes;
}

/** Same byte verification and FontFace loading in Player and Chromium export. */
export async function loadCustomDesignFonts(
  manifest: CustomDesignManifest,
  media: CustomDesignMedia,
): Promise<Readonly<Record<string, string>>> {
  const pins = [...manifest.fonts, ...manifest.assets];
  const bytes = await Promise.all(
    pins.map((pin) => {
      const source = media[pin.assetId];
      if (!source)
        throw new Error(
          "A pinned font or image is missing. Reload media or restore the original import.",
        );
      return verifiedCustomBytes(source.url, pin.sha256);
    }),
  );
  await Promise.all(
    manifest.fonts.map(async (pin, index) => {
      const face = new FontFace(customFontFamily(pin.sha256), bytes[index]!, {
        weight: "400",
        style: "normal",
      });
      await face.load();
      document.fonts.add(face);
      if (face.status !== "loaded")
        throw new Error(
          "The pinned font could not load. Re-import a supported font.",
        );
    }),
  );
  await document.fonts.ready;
  const images: Record<string, string> = {};
  try {
    await Promise.all(
      manifest.assets.map(async (asset, index) => {
        const url = URL.createObjectURL(
          new Blob([bytes[manifest.fonts.length + index]!]),
        );
        images[asset.assetId] = url;
        const image = new globalThis.Image();
        image.src = url;
        await image.decode();
      }),
    );
    return images;
  } catch {
    Object.values(images).forEach((url) => URL.revokeObjectURL(url));
    throw new Error(
      "The pinned logo cannot be decoded. Restore the approved image or publish a replacement.",
    );
  }
}

export function resolveCustomIdentity(
  manifest: CustomDesignManifest,
): CinemaIdentity {
  const p = manifest.presentation;
  const colors = p.colors;
  const font = (id: string) =>
    `"${customFontFamily(manifest.fonts.find((f) => f.assetId === id)!.sha256)}"`;
  return {
    packId: "custom",
    name: "My Design System",
    colors: {
      ...colors,
      muted: colors.text,
      emphasis: colors.diagramEmphasis,
      onAccent: colors.background,
      line: mixColor(colors.text, colors.background, 0.65),
      softAccent: mixColor(colors.accent, colors.background, 0.85),
      softEmphasis: mixColor(colors.diagramEmphasis, colors.background, 0.85),
    },
    fonts: { display: font(p.fonts.heading), body: font(p.fonts.body) },
    displayWeight: 400,
    displayWidth: 0.6,
    bodyWidth: 0.6,
    kickerUppercase: false,
    radius: p.corners === "rounded" ? 24 : 0,
    stroke: p.stroke === "fine" ? 3 : 7,
    emphasisStyle: "underline",
    surface: p.corners === "rounded" ? "card" : "outline",
    imageFrame: p.imageFrame,
    lightBackground: false,
    customAlignment: p.alignment,
    customTypeScale: p.density === "compact" ? 0.9 : 1,
  };
}

/** Final-font layout gate. Geometry remains renderer-owned, never imported. */
export function assertCustomLayout(root: HTMLElement): void {
  const canvas = root.getBoundingClientRect();
  const ratio = canvas.width / 1920;
  for (const node of customTextNodes(root)) {
    const element = node.parentElement!;
    const range = document.createRange();
    range.selectNodeContents(node);
    const bounds = range.getBoundingClientRect();
    if (bounds.width === 0) continue;
    if (
      bounds.left < canvas.left + 20 * ratio ||
      bounds.right > canvas.right - 20 * ratio ||
      bounds.top < canvas.top ||
      bounds.bottom > canvas.top + 856 * ratio ||
      element.scrollWidth > element.clientWidth + 2
    ) {
      throw new Error(
        "Text does not fit with the selected font above the caption area. Shorten the text, use compact density, or choose another composition/font.",
      );
    }
    // Tables and hero boxes allocate fixed space even when overflow is visible.
    // Also catch text clipped by any other constrained ancestor.
    for (
      let ancestor: Element | null = element;
      ancestor && ancestor !== root;
      ancestor = ancestor.parentElement
    ) {
      const style = window.getComputedStyle(ancestor);
      if (
        !ancestor.matches('[role="table"], [data-cinema-hero]') &&
        ![style.overflowX, style.overflowY].some((value) =>
          /^(hidden|clip|auto|scroll)$/.test(value),
        )
      )
        continue;
      const box = ancestor.getBoundingClientRect();
      const tolerance = 2 * ratio;
      if (
        bounds.left < box.left - tolerance ||
        bounds.right > box.right + tolerance ||
        bounds.top < box.top - tolerance ||
        bounds.bottom > box.bottom + tolerance
      ) {
        throw new Error(
          "Text does not fit its table or content area with the selected font. Shorten the content or choose another composition/font.",
        );
      }
    }
  }
}

function CustomFontGate({
  manifest,
  media,
  children,
}: {
  manifest: CustomDesignManifest;
  media: CustomDesignMedia;
  children: (assets: Readonly<Record<string, string>>) => ReactNode;
}): JSX.Element | null {
  const { delayRender, continueRender, cancelRender } = useDelayRender();
  const [handle] = useState(() =>
    delayRender("Loading pinned custom design", {
      timeoutInMilliseconds: 30000,
    }),
  );
  const [ready, setReady] = useState(false);
  const [assets, setAssets] = useState<Readonly<Record<string, string>>>({});
  const [error, setError] = useState<Error>();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    let loaded: Readonly<Record<string, string>> = {};
    void loadCustomDesignFonts(manifest, media).then(
      (urls) => {
        loaded = urls;
        if (active) {
          setAssets(urls);
          setReady(true);
        } else Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
      },
      (failure) => {
        if (active) {
          const failed =
            failure instanceof Error
              ? failure
              : new Error(
                  "Check the selected imports and glyph coverage, then reload.",
                );
          setError(failed);
          cancelRender(failed);
        }
      },
    );
    return () => {
      active = false;
      Object.values(loaded).forEach((url) => URL.revokeObjectURL(url));
      continueRender(handle);
    };
  }, [manifest, media, handle, continueRender, cancelRender]);
  useEffect(() => {
    if (!ready || !root.current) return;
    try {
      assertCustomLayout(root.current);
      assertCustomRenderedGlyphs(manifest, root.current);
    } catch (failure) {
      const failed =
        failure instanceof Error ? failure : new Error("Custom layout failed.");
      setError(failed);
      cancelRender(failed);
      return;
    }
    const capture = requestAnimationFrame(() => continueRender(handle));
    return () => globalThis.cancelAnimationFrame(capture);
  }, [ready, handle, manifest, continueRender, cancelRender]);
  if (error) throw error;
  return ready ? (
    <div ref={root} style={{ width: "100%", height: "100%" }}>
      {children(assets)}
    </div>
  ) : null;
}

/** Manifest v3 has its own entry point; legacy readers never resolve it as a pack. */
export function CustomDesignScene({
  manifest: raw,
  media,
  scene,
  durationInFrames,
  resolvedAssets = {},
}: {
  manifest: CustomDesignManifest;
  media: CustomDesignMedia;
  scene: SceneSpec;
  durationInFrames: number;
  resolvedAssets?: Readonly<Record<string, ResolvedSceneAsset>>;
}): JSX.Element {
  const manifest = useMemo(() => customDesignManifestSchema.parse(raw), [raw]);
  const gateKey = useMemo(
    () => designSystemContentHash({ manifest, media, sceneId: scene.id }),
    [manifest, media, scene.id],
  );
  const frame = useCurrentFrame();
  const design = manifest.scenes[scene.id];
  if (!design)
    throw new Error(
      "The saved custom design has no composition for this scene. Compile a new snapshot.",
    );
  const identity = resolveCustomIdentity(manifest);
  const pin = manifest.scenePins[scene.id];
  if (
    !pin ||
    pin.contentHash !== designSystemContentHash(scene) ||
    durationInFrames !== Math.round(scene.durationSeconds * 30)
  )
    throw new Error(
      "The scene changed after this custom design was compiled. Save a new design snapshot.",
    );
  const frames = pin.beatFrames;
  const timeline = createBeatTimeline({
    beats: design.beats,
    frames,
    frame,
    durationInFrames,
    energy: manifest.presentation.motion.intensity,
    customMotion: manifest.presentation.motion,
  });
  const Composition = cinemaCompositionComponents[design.compositionId];
  const chart =
    scene.template === "data-chart"
      ? resolveSceneChart(scene, resolvedAssets)
      : undefined;
  if (chart && !chart.ok) throw new Error(chart.failure.message);
  return (
    <div
      data-custom-scene={design.compositionId}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: identity.colors.background,
        color: identity.colors.text,
        fontSynthesis: "none",
      }}
    >
      <CustomFontGate key={gateKey} manifest={manifest} media={media}>
        {(assets) => (
          <>
            <CinemaBeatProvider timeline={timeline}>
              <Composition
                scene={scene}
                design={design}
                identity={identity}
                chart={chart}
                hero={resolveCinemaHero({
                  scene,
                  design,
                  assets: resolvedAssets,
                  mode: "render",
                })}
                itemIcons={resolveCinemaItemIcons({
                  scene,
                  assets: resolvedAssets,
                  mode: "render",
                })}
                sequenceIcons={resolveCinemaItemIcons({
                  scene,
                  assets: resolvedAssets,
                  mode: "render",
                  forSequence: true,
                })}
                subjects={resolveCinemaSubjectImages({
                  scene,
                  assets: resolvedAssets,
                  mode: "render",
                })}
              />
            </CinemaBeatProvider>
            {manifest.presentation.logoAssetId === null ? null : (
              <img
                alt="Design system logo"
                src={assets[manifest.presentation.logoAssetId]}
                style={{
                  position: "absolute",
                  top: 24,
                  right: 120,
                  width: 140,
                  height: 56,
                  objectFit: "contain",
                }}
              />
            )}
          </>
        )}
      </CustomFontGate>
    </div>
  );
}
