/**
 * ST-095 — font readiness.
 *
 * The proof holds appearance to `mvp-default`, so there is exactly one family
 * to wait for: Atkinson Hyperlegible, the face `videoTheme` declares.
 *
 * Remotion captures a frame as soon as React has committed unless something
 * holds the render open. Without the hold, early frames can be measured and
 * captured against a fallback face, which shifts text widths by a few percent
 * between the browser preview and the server render — exactly the
 * environment-dependent drift the determinism criterion is meant to exclude.
 */

import { continueRender, delayRender } from "remotion";
import { useEffect, useState, type JSX, type ReactNode } from "react";
import { videoFont } from "@avlp/design-system/video-theme";

/**
 * Loaded as a promise rather than fire-and-forget: `document.fonts.load()`
 * must not run before the `@font-face` rules exist, or it finds nothing to
 * load, resolves immediately and lets the frame be captured against a
 * fallback. `webpackMode: "eager"` keeps the stylesheets in the main bundle so
 * there is no second fetch to lose.
 */
const stylesheetsLoaded: Promise<unknown> =
  typeof window === "undefined"
    ? Promise.resolve()
    : Promise.all([
        import(/* webpackMode: "eager" */ "@fontsource/atkinson-hyperlegible/400.css"),
        import(/* webpackMode: "eager" */ "@fontsource/atkinson-hyperlegible/700.css"),
      ]);

/** The exact faces a frame may be measured or captured against. */
export const demonstrationRequiredFontSpecifiers: readonly string[] =
  Object.freeze([
    `400 64px "${videoFont.family}"`,
    `700 64px "${videoFont.family}"`,
  ]);

/**
 * Resolves once every pinned face is genuinely usable, and throws when one is
 * not. A frame captured against a substituted font is not the design that was
 * approved, so failing loudly beats rendering something subtly different.
 */
export async function waitForDemonstrationFonts(): Promise<void> {
  if (typeof document === "undefined" || document.fonts === undefined) return;
  await stylesheetsLoaded;
  await Promise.all(
    demonstrationRequiredFontSpecifiers.map((specifier) =>
      document.fonts.load(specifier),
    ),
  );
  await document.fonts.ready;
  const missing = demonstrationRequiredFontSpecifiers.filter(
    (specifier) => !document.fonts.check(specifier),
  );
  if (missing.length > 0)
    throw new Error(
      `Demonstration proof fonts unavailable: ${missing.join(", ")}. Rendering against a fallback face would not reproduce the approved design.`,
    );
}

/** Blocks capture until the pinned faces are ready. Wrap the composition once. */
export function DemonstrationFontGate({
  children,
}: Readonly<{ children: ReactNode }>): JSX.Element | null {
  const [handle] = useState(() =>
    delayRender("ST-095 demonstration fonts loading", {
      timeoutInMilliseconds: 30_000,
    }),
  );
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<Error>();
  useEffect(() => {
    let cancelled = false;
    void waitForDemonstrationFonts().then(
      () => {
        if (cancelled) return;
        setReady(true);
        continueRender(handle);
      },
      (error: unknown) => {
        if (cancelled) return;
        setFailure(error instanceof Error ? error : new Error(String(error)));
        continueRender(handle);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [handle]);
  if (failure !== undefined) throw failure;
  if (!ready) return null;
  return <>{children}</>;
}
