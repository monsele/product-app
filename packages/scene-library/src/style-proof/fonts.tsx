/**
 * ST-094 — font readiness.
 *
 * Remotion captures a frame as soon as React has committed unless something
 * holds the render open. Without that hold, the first frames of a render can
 * be measured and captured against a fallback font, which is exactly the
 * environment-dependent drift the story forbids. `delayRender` keeps both the
 * browser preview and the server render waiting until every pinned face this
 * proof uses reports ready.
 */

import { continueRender, delayRender } from "remotion";
import { useEffect, useState, type JSX, type ReactNode } from "react";
import { styleProofFontFaces } from "@avlp/design-system/style-proof-tokens";

/**
 * The pinned stylesheets, as a promise rather than fire-and-forget.
 *
 * `void import(...)` left a race: `document.fonts.load()` could run before the
 * `@font-face` rules existed, find nothing to load, resolve immediately, and
 * let the frame be captured against a fallback face. That produced a real ~3%
 * text-width difference between the browser preview and the server render.
 *
 * `webpackMode: "eager"` keeps the stylesheets inside the main bundle rather
 * than in separate chunks, so there is no second network fetch to lose, and the
 * promise below settles as soon as the bundle itself has evaluated.
 */
const styleProofStylesheetsLoaded: Promise<unknown> =
  typeof window === "undefined"
    ? Promise.resolve()
    : Promise.all([
        import(/* webpackMode: "eager" */ "@fontsource/inter/400.css"),
        import(/* webpackMode: "eager" */ "@fontsource/inter/600.css"),
        import(/* webpackMode: "eager" */ "@fontsource/inter/700.css"),
        import(/* webpackMode: "eager" */ "@fontsource/source-serif-4/400.css"),
        import(/* webpackMode: "eager" */ "@fontsource/source-serif-4/600.css"),
        import(/* webpackMode: "eager" */ "@fontsource/source-serif-4/700.css"),
        import(/* webpackMode: "eager" */ "@fontsource/nunito/400.css"),
        import(/* webpackMode: "eager" */ "@fontsource/nunito/700.css"),
        import(/* webpackMode: "eager" */ "@fontsource/atkinson-hyperlegible/400.css"),
        import(/* webpackMode: "eager" */ "@fontsource/atkinson-hyperlegible/700.css"),
      ]);

/** The exact faces a frame may be measured or captured against. */
export const styleProofRequiredFontSpecifiers: readonly string[] =
  Object.freeze(
    styleProofFontFaces.map(
      (face) => `${face.weight} 64px "${face.family}"`,
    ),
  );

/**
 * Resolves once every pinned face is genuinely usable. Throws when a face is
 * still unavailable afterwards: a frame measured or captured against a
 * substituted font is not the design that was approved, so failing loudly is
 * the correct behaviour rather than rendering something subtly different.
 */
export async function waitForProofFonts(): Promise<void> {
  if (typeof document === "undefined" || document.fonts === undefined) return;
  await styleProofStylesheetsLoaded;
  await Promise.all(
    styleProofRequiredFontSpecifiers.map((specifier) =>
      document.fonts.load(specifier),
    ),
  );
  await document.fonts.ready;
  const missing = styleProofRequiredFontSpecifiers.filter(
    (specifier) => !document.fonts.check(specifier),
  );
  if (missing.length > 0)
    throw new Error(
      `Style proof fonts unavailable: ${missing.join(", ")}. Rendering against a fallback face would not reproduce the approved design.`,
    );
}

/**
 * Blocks capture until the pinned faces are ready, then renders `children`.
 * Wrap the composition once; treatments do not each need their own gate.
 */
export function StyleProofFontGate({
  children,
}: Readonly<{ children: ReactNode }>): JSX.Element | null {
  const [handle] = useState(() =>
    delayRender("ST-094 proof fonts loading", { timeoutInMilliseconds: 30_000 }),
  );
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<Error>();
  useEffect(() => {
    let cancelled = false;
    void waitForProofFonts().then(
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
