/**
 * ST-108 — native primitives for v2 compositions.
 *
 * Every primitive paints only with the resolved identity. A bound picture
 * renders as an `<img>`; when no picture exists a composition draws an
 * authored motif in the same identity. There is no glyph placeholder
 * anywhere in this path.
 */
import type {
  CinemaMotifKind,
  DiagramAnchor,
  SourceTableVisual,
} from "@avlp/schemas";
import type { CSSProperties, JSX, ReactNode } from "react";
import { mixColor, surfaceStyle, type CinemaIdentity } from "./identity.js";

export type CinemaHero =
  | Readonly<{
      kind: "image";
      src: string;
      alt: string;
      /** Evidence (source figures, diagrams) is never cropped. */
      evidence: boolean;
    }>
  | Readonly<{ kind: "table"; table: SourceTableVisual; alt: string }>
  | Readonly<{ kind: "shape"; shape: CinemaShape }>
  | Readonly<{ kind: "motif"; motif: CinemaMotifKind }>;

export type CinemaIcon = Readonly<{ src: string; alt: string }>;

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export function Kicker({
  identity,
  children,
  style,
}: Readonly<{ identity: CinemaIdentity; children: string; style?: CSSProperties }>): JSX.Element {
  return (
    <p
      data-cinema-kicker
      style={{
        color: identity.colors.accent,
        fontFamily: identity.fonts.body,
        fontSize: 26,
        fontWeight: 700,
        letterSpacing: identity.kickerUppercase ? "0.14em" : "0.01em",
        lineHeight: 1.2,
        margin: 0,
        textTransform: identity.kickerUppercase ? "uppercase" : "none",
        ...style,
      }}
    >
      {children}
    </p>
  );
}

function stripped(word: string): string {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/** Wraps emphasised words in the identity's emphasis treatment. */
export function EmphasisText({
  identity,
  text,
  words,
  progress,
}: Readonly<{
  identity: CinemaIdentity;
  text: string;
  words: readonly string[];
  progress: number;
}>): JSX.Element {
  const wanted = new Set(words);
  const parts = text.split(/(\s+)/u);
  const { colors } = identity;
  return (
    <>
      {parts.map((part, index) => {
        if (!wanted.has(stripped(part)) || part.trim().length === 0)
          return <span key={index}>{part}</span>;
        const style: CSSProperties =
          identity.emphasisStyle === "underline"
            ? {
                backgroundImage: `linear-gradient(${colors.accent}, ${colors.accent})`,
                backgroundPosition: "0 92%",
                backgroundRepeat: "no-repeat",
                backgroundSize: `${progress * 100}% 0.12em`,
              }
            : identity.emphasisStyle === "highlight"
              ? {
                  backgroundImage: `linear-gradient(${colors.softAccent}, ${colors.softAccent})`,
                  backgroundPosition: "0 86%",
                  backgroundRepeat: "no-repeat",
                  backgroundSize: `${progress * 100}% 0.34em`,
                  borderRadius: 8,
                }
              : identity.emphasisStyle === "color"
                ? {
                    color: mixColor(colors.text, colors.accent, progress),
                    fontStyle:
                      identity.fonts.display.includes("Serif") ? "italic" : "normal",
                  }
                : identity.emphasisStyle === "block"
                  ? {
                      backgroundImage: `linear-gradient(${colors.accent}, ${colors.accent})`,
                      backgroundRepeat: "no-repeat",
                      backgroundSize: `${progress * 100}% 100%`,
                      color: progress > 0.5 ? colors.onAccent : colors.text,
                      padding: "0 0.1em",
                    }
                  : {
                      borderRadius: "50%",
                      boxShadow: `0 0 0 ${Math.round(progress * 4)}px ${mixColor(colors.background, colors.accent, progress)}`,
                      // An inline ring follows the face's content area, which
                      // in the serif reaches into the kicker above; a tight
                      // inline-block keeps it to the word itself.
                      display: "inline-block",
                      lineHeight: 1.1,
                      padding: "0 0.16em",
                    };
        return (
          <span data-cinema-emphasis key={index} style={style}>
            {part}
          </span>
        );
      })}
    </>
  );
}

export function DisplayText({
  identity,
  fontSize,
  children,
  style,
  as = "h1",
}: Readonly<{
  identity: CinemaIdentity;
  fontSize: number;
  children: ReactNode;
  style?: CSSProperties;
  as?: "h1" | "h2" | "p";
}>): JSX.Element {
  const Tag = as;
  return (
    <Tag
      data-cinema-display
      style={{
        color: identity.colors.text,
        fontFamily: identity.fonts.display,
        fontSize,
        fontWeight: identity.displayWeight,
        letterSpacing: fontSize > 90 ? "-0.02em" : "-0.01em",
        lineHeight: 1.08,
        margin: 0,
        overflowWrap: "anywhere",
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}

export function BodyText({
  identity,
  fontSize,
  children,
  style,
  muted = false,
}: Readonly<{
  identity: CinemaIdentity;
  fontSize: number;
  children: ReactNode;
  style?: CSSProperties;
  muted?: boolean;
}>): JSX.Element {
  return (
    <p
      style={{
        color: muted ? identity.colors.muted : identity.colors.text,
        fontFamily: identity.fonts.body,
        fontSize,
        lineHeight: 1.3,
        margin: 0,
        overflowWrap: "anywhere",
        ...style,
      }}
    >
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Surfaces, badges and connectors
// ---------------------------------------------------------------------------

export function Surface({
  identity,
  children,
  style,
  active,
  tone,
  ...rest
}: Readonly<{
  identity: CinemaIdentity;
  children: ReactNode;
  style?: CSSProperties;
  active?: boolean;
  tone?: "plain" | "accent";
  [data: `data-${string}`]: string | number | boolean | undefined;
}>): JSX.Element {
  return (
    <div
      {...rest}
      style={{
        boxSizing: "border-box",
        ...surfaceStyle(identity, {
          ...(active === undefined ? {} : { active }),
          ...(tone === undefined ? {} : { tone }),
        }),
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function NumberBadge({
  identity,
  value,
  size,
  active,
}: Readonly<{ identity: CinemaIdentity; value: number | string; size: number; active: boolean }>): JSX.Element {
  const { colors } = identity;
  const filled = active || identity.surface === "block";
  return (
    <span
      aria-hidden
      style={{
        alignItems: "center",
        background: filled ? colors.accent : colors.background,
        border: `${Math.max(2, Math.round(identity.stroke * 0.75))}px solid ${active ? colors.accent : colors.line}`,
        borderRadius: identity.radius === 0 ? 0 : "50%",
        boxSizing: "border-box",
        color: filled ? colors.onAccent : colors.text,
        display: "inline-flex",
        flexShrink: 0,
        fontFamily: identity.fonts.display,
        fontSize: Math.max(26, Math.round(size * 0.5)),
        fontWeight: 700,
        height: size,
        justifyContent: "center",
        width: size,
      }}
    >
      {value}
    </span>
  );
}

/** A straight or gently curved arrow that draws on with `progress`. */
export function Connector({
  identity,
  from,
  to,
  progress,
  active = false,
  curve = 0,
  arrow = true,
}: Readonly<{
  identity: CinemaIdentity;
  from: Readonly<{ x: number; y: number }>;
  to: Readonly<{ x: number; y: number }>;
  progress: number;
  active?: boolean;
  curve?: number;
  arrow?: boolean;
}>): JSX.Element {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const control = { x: midX - (dy / length) * curve, y: midY + (dx / length) * curve };
  const path = `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`;
  const approx = length + Math.abs(curve) * 0.8;
  const color = active ? identity.colors.accent : identity.colors.emphasis;
  const angle = Math.atan2(to.y - control.y, to.x - control.x);
  const head = 16 + identity.stroke * 1.5;
  const tip = `${to.x},${to.y} ${to.x - head * Math.cos(angle - 0.45)},${to.y - head * Math.sin(angle - 0.45)} ${to.x - head * Math.cos(angle + 0.45)},${to.y - head * Math.sin(angle + 0.45)}`;
  return (
    <g data-cinema-connector opacity={progress > 0 ? 1 : 0}>
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeDasharray={identity.surface === "paper" ? `${identity.stroke * 3} ${identity.stroke * 2}` : `${approx} ${approx}`}
        strokeDashoffset={identity.surface === "paper" ? 0 : approx * (1 - progress)}
        strokeLinecap="round"
        strokeWidth={identity.stroke + (active ? 2 : 0)}
        opacity={identity.surface === "paper" ? progress : 1}
      />
      {arrow && progress > 0.92 ? <polygon fill={color} points={tip} /> : null}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Pictures
// ---------------------------------------------------------------------------

/**
 * A multiply blend only reaches as far as the nearest stacking context, and
 * every animated ancestor (opacity, transform) creates one. So a picture that
 * blends into the page carries its own backdrop in the colour it sits on;
 * otherwise its pale background shows as a box.
 */
export function ItemIcon({
  icon,
  identity,
  size,
  backdrop,
}: Readonly<{ icon: CinemaIcon; identity: CinemaIdentity; size: number; backdrop?: string }>): JSX.Element {
  const radius = identity.radius === 0 ? 0 : Math.min(identity.radius, size / 4);
  return (
    <span
      style={{
        background: identity.lightBackground ? (backdrop ?? identity.colors.background) : identity.colors.surface,
        borderRadius: radius,
        display: "inline-flex",
        flexShrink: 0,
        height: size,
        width: size,
      }}
    >
      <img
        alt={icon.alt}
        data-cinema-item-image
        src={icon.src}
        style={{
          borderRadius: radius,
          height: size,
          mixBlendMode: identity.lightBackground ? "multiply" : "normal",
          objectFit: "contain",
          width: size,
        }}
      />
    </span>
  );
}

/** Padding the identity's image frame keeps around its content. */
export function heroFrameInset(identity: CinemaIdentity): number {
  const frame = identity.imageFrame;
  return frame === "rounded" || frame === "paper" || frame === "block" ? 28 : 0;
}

/**
 * The scene's hero visual inside the identity's image frame. `drift` gives a
 * restrained slow push-in over the scene; `progress` is its arrival.
 * `shapeParts` are the labelled parts of a native shape drawing, in the box
 * left inside `heroFrameInset`.
 */
export function HeroVisual({
  hero,
  identity,
  width,
  height,
  progress,
  drift,
  bleed = false,
  shapeParts,
}: Readonly<{
  hero: CinemaHero;
  identity: CinemaIdentity;
  width: number;
  height: number;
  progress: number;
  drift: number;
  bleed?: boolean;
  shapeParts?: readonly ShapePart[] | undefined;
}>): JSX.Element {
  const { colors } = identity;
  const scale = 1 + drift * (identity.packId === "prism" ? 0.05 : 0.03);
  const frame = identity.imageFrame;
  const inset = heroFrameInset(identity);
  // A real picture is rarely a cutout on white, so multiplying it over the
  // blob turns it grey. In the blob frame it sits whole and unblended in front
  // of the blob, which shows around it.
  const onBlob = frame === "blob" && hero.kind === "image";
  const innerWidth = (width - inset * 2) * (onBlob ? 0.84 : 1);
  const innerHeight = (height - inset * 2) * (onBlob ? 0.84 : 1);
  const content: JSX.Element =
    hero.kind === "image" ? (
      <img
        alt={hero.alt}
        data-cinema-hero-image
        src={hero.src}
        style={{
          borderRadius: onBlob ? identity.radius : 0,
          display: "block",
          height: innerHeight,
          mixBlendMode:
            identity.lightBackground && frame !== "rule" && frame !== "block" && !onBlob
              ? "multiply"
              : "normal",
          objectFit: hero.evidence || frame !== "rule" || !bleed ? "contain" : "cover",
          transform: `scale(${scale})`,
          transformOrigin: "50% 60%",
          width: innerWidth,
        }}
      />
    ) : hero.kind === "table" ? (
      <SourceTable identity={identity} table={hero.table} width={innerWidth} height={innerHeight} />
    ) : hero.kind === "shape" ? (
      <ShapeDiagram identity={identity} shape={hero.shape} width={innerWidth} height={innerHeight} progress={progress} parts={shapeParts} />
    ) : (
      <Motif identity={identity} kind={hero.motif} width={innerWidth} height={innerHeight} progress={progress} drift={drift} />
    );
  const frameStyle: CSSProperties =
    frame === "rounded"
      ? { background: colors.surface, border: `${identity.stroke - 1}px solid ${colors.line}`, borderRadius: identity.radius }
      : frame === "paper"
        ? {
            background: colors.surface,
            border: `2px dashed ${colors.line}`,
            borderRadius: identity.radius,
            transform: "rotate(-1.2deg)",
          }
        : frame === "block"
          ? { background: colors.surface, boxShadow: `18px 18px 0 ${colors.accent}` }
          : // The page colour, painted inside the frame's own stacking
            // context so a multiplied picture blends into the page.
            { background: colors.background };
  return (
    <div
      data-cinema-hero={hero.kind}
      style={{
        alignItems: "center",
        boxSizing: "border-box",
        display: "flex",
        height,
        justifyContent: "center",
        opacity: progress,
        overflow: hero.kind === "image" ? "hidden" : "visible",
        padding: inset,
        position: "relative",
        width,
        ...frameStyle,
      }}
    >
      {frame === "blob" && hero.kind !== "table" ? (
        <div
          aria-hidden
          style={{
            background: colors.softAccent,
            borderRadius: "46% 54% 52% 48% / 55% 45% 55% 45%",
            height: height * 0.86,
            left: width * 0.07,
            position: "absolute",
            top: height * 0.07,
            transform: `scale(${0.9 + progress * 0.1}) rotate(${drift * 6}deg)`,
            width: width * 0.86,
          }}
        />
      ) : null}
      <div style={{ position: "relative" }}>{content}</div>
    </div>
  );
}

/** Authored identity-drawn artwork used when no picture exists. */
export function Motif({
  identity,
  kind,
  width,
  height,
  progress,
  drift,
}: Readonly<{
  identity: CinemaIdentity;
  kind: CinemaMotifKind;
  width: number;
  height: number;
  progress: number;
  drift: number;
}>): JSX.Element {
  const { colors } = identity;
  const size = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const r = size * 0.36;
  const stroke = identity.stroke + 2;
  const spin = drift * 24;
  const shapes: JSX.Element[] = [];
  switch (kind) {
    case "orbit":
      shapes.push(
        <circle key="ring" cx={cx} cy={cy} r={r} fill="none" stroke={colors.line} strokeWidth={stroke} />,
        <circle key="core" cx={cx} cy={cy} r={r * 0.42 * progress} fill={colors.softAccent} />,
        ...[0, 1, 2].map((index) => {
          const angle = ((index * 120 + spin) * Math.PI) / 180;
          return (
            <circle
              key={`dot-${index}`}
              cx={cx + Math.cos(angle) * r}
              cy={cy + Math.sin(angle) * r}
              r={size * 0.055}
              fill={index === 0 ? colors.accent : colors.emphasis}
            />
          );
        }),
      );
      break;
    case "stack":
      [2, 1, 0].forEach((index) =>
        shapes.push(
          <rect
            key={index}
            x={cx - r + index * size * 0.06}
            y={cy - r * 0.6 + index * size * 0.12 - (1 - progress) * 20}
            width={r * 1.6}
            height={r * 0.9}
            rx={Math.min(identity.radius, 24)}
            fill={index === 0 ? colors.accent : index === 1 ? colors.softAccent : colors.softEmphasis}
            stroke={colors.line}
            strokeWidth={index === 0 ? 0 : 2}
          />,
        ),
      );
      break;
    case "path": {
      const points = [0, 1, 2, 3].map((index) => ({
        x: width * (0.14 + index * 0.24),
        y: cy + Math.sin(index * 1.6 + 0.4) * r * 0.55,
      }));
      shapes.push(
        <polyline
          key="line"
          points={points.map((point) => `${point.x},${point.y}`).join(" ")}
          fill="none"
          stroke={colors.line}
          strokeWidth={stroke}
          strokeDasharray={`${width * 1.4}`}
          strokeDashoffset={width * 1.4 * (1 - progress)}
        />,
        ...points.map((point, index) => (
          <circle
            key={index}
            cx={point.x}
            cy={point.y}
            r={size * 0.06}
            fill={index === 3 ? colors.accent : colors.emphasis}
          />
        )),
      );
      break;
    }
    case "split":
      shapes.push(
        <circle key="left" cx={cx - r * 0.55} cy={cy} r={r * 0.75} fill={colors.softAccent} />,
        <circle key="right" cx={cx + r * 0.55} cy={cy} r={r * 0.75} fill={colors.softEmphasis} />,
        <line key="divide" x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke={colors.accent} strokeWidth={stroke} />,
      );
      break;
    case "burst":
      shapes.push(
        ...Array.from({ length: 10 }, (_, index) => {
          const angle = ((index * 36 + spin) * Math.PI) / 180;
          return (
            <line
              key={index}
              x1={cx + Math.cos(angle) * r * 0.45}
              y1={cy + Math.sin(angle) * r * 0.45}
              x2={cx + Math.cos(angle) * r * (0.45 + 0.55 * progress)}
              y2={cy + Math.sin(angle) * r * (0.45 + 0.55 * progress)}
              stroke={index % 2 === 0 ? colors.accent : colors.emphasis}
              strokeLinecap="round"
              strokeWidth={stroke}
            />
          );
        }),
        <circle key="core" cx={cx} cy={cy} r={r * 0.32} fill={colors.softAccent} />,
      );
      break;
    case "grid":
      for (let row = 0; row < 4; row += 1)
        for (let column = 0; column < 4; column += 1)
          shapes.push(
            <rect
              key={`${row}-${column}`}
              x={cx - r + column * r * 0.52}
              y={cy - r + row * r * 0.52}
              width={r * 0.4}
              height={r * 0.4}
              rx={Math.min(identity.radius, 10)}
              fill={
                (row + column) % 3 === 0
                  ? colors.accent
                  : (row * column) % 2 === 0
                    ? colors.softEmphasis
                    : colors.softAccent
              }
              opacity={Math.min(1, progress * 1.4 - (row + column) * 0.05)}
            />,
          );
      break;
    case "wave":
      [0, 1, 2].forEach((index) => {
        const y = cy - r * 0.5 + index * r * 0.5;
        const d = `M ${width * 0.1} ${y} ${Array.from({ length: 8 }, (_, step) => {
          const x = width * (0.1 + (step + 1) * 0.1);
          return `Q ${x - width * 0.05} ${y + (step % 2 === 0 ? -1 : 1) * r * 0.22} ${x} ${y}`;
        }).join(" ")}`;
        shapes.push(
          <path
            key={index}
            d={d}
            fill="none"
            stroke={index === 1 ? colors.accent : colors.emphasis}
            strokeLinecap="round"
            strokeWidth={stroke}
            opacity={progress}
          />,
        );
      });
      break;
    case "spark": {
      const points = Array.from({ length: 16 }, (_, index) => {
        const angle = (index * Math.PI) / 8 + (spin * Math.PI) / 360;
        const radius = index % 2 === 0 ? r : r * 0.42;
        return `${cx + Math.cos(angle) * radius * progress},${cy + Math.sin(angle) * radius * progress}`;
      });
      shapes.push(
        <circle key="halo" cx={cx} cy={cy} r={r * 1.05} fill={colors.softAccent} />,
        <polygon key="star" points={points.join(" ")} fill={colors.accent} />,
      );
      break;
    }
  }
  return (
    <svg aria-hidden data-cinema-motif={kind} height={height} style={{ display: "block" }} viewBox={`0 0 ${width} ${height}`} width={width}>
      {shapes}
    </svg>
  );
}

export type CinemaShape = "cell" | "cycle" | "plant" | "system";

/** A labelled part of a native shape drawing, in the drawing's own box. */
export type ShapePart = Readonly<{ x: number; y: number; reveal: number; active: boolean }>;

const anchorDirection: Readonly<Record<DiagramAnchor, readonly [number, number]>> = {
  "top-left": [-1, -1],
  top: [0, -1],
  "top-right": [1, -1],
  right: [1, 0],
  "bottom-right": [1, 1],
  bottom: [0, 1],
  "bottom-left": [-1, 1],
  left: [-1, 0],
  center: [0, 0],
};

const shapeRadius = (width: number, height: number): number => Math.min(width, height) * 0.42;

/**
 * Moves angles apart until neighbours on the circle are at least `minGap`
 * apart, keeping their order. Deterministic: ties keep declaration order.
 */
function spreadAngles(angles: readonly number[], minGap: number): readonly number[] {
  const order = angles
    .map((angle, index) => ({ angle, index }))
    .sort((a, b) => a.angle - b.angle || a.index - b.index);
  const count = order.length;
  if (count > 1 && count * minGap <= Math.PI * 2)
    for (let pass = 0; pass < 80; pass += 1) {
      let moved = false;
      for (let at = 0; at < count; at += 1) {
        const one = order[at]!;
        const two = order[(at + 1) % count]!;
        const gap = two.angle + (at === count - 1 ? Math.PI * 2 : 0) - one.angle;
        if (gap >= minGap - 1e-6) continue;
        one.angle -= (minGap - gap) / 2;
        two.angle += (minGap - gap) / 2;
        moved = true;
      }
      if (!moved) break;
    }
  const result = angles.slice();
  for (const entry of order) result[entry.index] = entry.angle;
  return result;
}

/**
 * Where each label's part sits on a native shape drawing of the given box,
 * so a callout or marker can land on the drawing itself. A part sits in its
 * anchor's direction; parts that would crowd each other move apart.
 */
export function shapePartPoints(
  shape: CinemaShape,
  anchors: readonly DiagramAnchor[],
  width: number,
  height: number,
): readonly Readonly<{ x: number; y: number }>[] {
  const cx = width / 2;
  const cy = height / 2;
  const r = shapeRadius(width, height);
  const [ex, ey] =
    shape === "cell"
      ? [r * 0.95, r * 0.72]
      : shape === "cycle"
        ? [r, r]
        : shape === "plant"
          ? [r * 0.62, r * 0.8]
          : [r * 1.05, r * 0.74];
  const around = anchors.flatMap((anchor, index) => (anchor === "center" ? [] : [index]));
  const angles = spreadAngles(
    around.map((index) => {
      const [dx, dy] = anchorDirection[anchors[index]!];
      return Math.atan2(dy, dx);
    }),
    shape === "system" ? 0.5 : 0.3,
  );
  const angleOf = new Map(around.map((index, at) => [index, angles[at]!]));
  let centred = 0;
  return anchors.map((_, index) => {
    const angle = angleOf.get(index);
    if (angle === undefined) {
      const spread = Math.ceil(centred / 2) * (centred % 2 === 0 ? -1 : 1);
      centred += 1;
      return { x: cx + spread * r * 0.45, y: cy };
    }
    return { x: cx + Math.cos(angle) * ex, y: cy + Math.sin(angle) * ey };
  });
}

/**
 * A native drawing for shapes-only labelled diagrams. Given `parts`, a
 * `system` is drawn from them: one node per labelled part around a hub.
 */
export function ShapeDiagram({
  identity,
  shape,
  width,
  height,
  progress,
  parts,
}: Readonly<{
  identity: CinemaIdentity;
  shape: CinemaShape;
  width: number;
  height: number;
  progress: number;
  parts?: readonly ShapePart[] | undefined;
}>): JSX.Element {
  const { colors } = identity;
  const cx = width / 2;
  const cy = height / 2;
  const r = shapeRadius(width, height);
  const stroke = identity.stroke + 2;
  let body: JSX.Element;
  if (shape === "cell")
    body = (
      <>
        <ellipse cx={cx} cy={cy} rx={r * 1.25} ry={r} fill={colors.softEmphasis} stroke={colors.emphasis} strokeWidth={stroke} />
        <ellipse cx={cx - r * 0.25} cy={cy - r * 0.1} rx={r * 0.34} ry={r * 0.28} fill={colors.softAccent} stroke={colors.accent} strokeWidth={stroke} />
        <circle cx={cx - r * 0.25} cy={cy - r * 0.1} r={r * 0.1} fill={colors.accent} />
        <ellipse cx={cx + r * 0.6} cy={cy + r * 0.35} rx={r * 0.2} ry={r * 0.1} fill={colors.emphasis} />
      </>
    );
  else if (shape === "cycle")
    body = (
      <>
        {[0, 1, 2, 3].map((index) => {
          const start = (index * Math.PI) / 2 + 0.2;
          const end = start + Math.PI / 2 - 0.4;
          return (
            <path
              key={index}
              d={`M ${cx + Math.cos(start) * r} ${cy + Math.sin(start) * r} A ${r} ${r} 0 0 1 ${cx + Math.cos(end) * r} ${cy + Math.sin(end) * r}`}
              fill="none"
              stroke={index % 2 === 0 ? colors.accent : colors.emphasis}
              strokeLinecap="round"
              strokeWidth={stroke + 2}
            />
          );
        })}
        <circle cx={cx} cy={cy} r={r * 0.3} fill={colors.softAccent} />
      </>
    );
  else if (shape === "plant")
    body = (
      <>
        <line x1={cx} y1={cy + r} x2={cx} y2={cy - r * 0.3} stroke={colors.emphasis} strokeWidth={stroke + 2} />
        <ellipse cx={cx - r * 0.35} cy={cy - r * 0.2} rx={r * 0.4} ry={r * 0.18} fill={colors.emphasis} transform={`rotate(-30 ${cx - r * 0.35} ${cy - r * 0.2})`} />
        <ellipse cx={cx + r * 0.35} cy={cy - r * 0.45} rx={r * 0.4} ry={r * 0.18} fill={colors.emphasis} transform={`rotate(30 ${cx + r * 0.35} ${cy - r * 0.45})`} />
        <circle cx={cx + r * 0.7} cy={cy - r * 0.85} r={r * 0.16} fill={colors.accent} />
        <path d={`M ${cx - r * 0.6} ${cy + r} Q ${cx} ${cy + r * 0.8} ${cx + r * 0.6} ${cy + r}`} fill="none" stroke={colors.line} strokeWidth={stroke} />
      </>
    );
  else if (parts !== undefined && parts.length > 0) {
    const nodeWidth = r * 0.4;
    const nodeHeight = r * 0.26;
    body = (
      <>
        {parts.map((part, index) => (
          <line key={`l-${index}`} x1={cx} y1={cy} x2={part.x} y2={part.y} stroke={colors.line} strokeWidth={stroke} opacity={part.reveal} />
        ))}
        <circle cx={cx} cy={cy} r={r * 0.16} fill={colors.softAccent} stroke={colors.accent} strokeWidth={stroke} />
        {parts.map((part, index) => (
          <rect
            key={`n-${index}`}
            x={part.x - nodeWidth / 2}
            y={part.y - nodeHeight / 2}
            width={nodeWidth}
            height={nodeHeight}
            rx={Math.min(identity.radius, 16)}
            fill={part.active ? colors.softAccent : colors.softEmphasis}
            stroke={part.active ? colors.accent : colors.emphasis}
            strokeWidth={stroke}
            opacity={part.reveal}
          />
        ))}
      </>
    );
  } else
    body = (
      <>
        {[
          [cx - r, cy - r * 0.5],
          [cx + r * 0.2, cy - r * 0.5],
          [cx - r * 0.4, cy + r * 0.3],
        ].map(([x, y], index) => (
          <rect key={index} x={x} y={y} width={r * 0.8} height={r * 0.5} rx={Math.min(identity.radius, 16)} fill={index === 2 ? colors.softAccent : colors.softEmphasis} stroke={index === 2 ? colors.accent : colors.emphasis} strokeWidth={stroke} />
        ))}
        <line x1={cx - r * 0.2} y1={cy - r * 0.25} x2={cx + r * 0.2} y2={cy - r * 0.25} stroke={colors.line} strokeWidth={stroke} />
        <line x1={cx} y1={cy} x2={cx} y2={cy + r * 0.3} stroke={colors.line} strokeWidth={stroke} />
      </>
    );
  return (
    <svg aria-label={`${shape} diagram`} data-cinema-shape={shape} height={height} viewBox={`0 0 ${width} ${height}`} width={width} style={{ display: "block", opacity: progress }}>
      {body}
    </svg>
  );
}

/** An approved source table drawn natively (ST-093 data, no markup). */
export function SourceTable({
  identity,
  table,
  width,
  height,
}: Readonly<{ identity: CinemaIdentity; table: SourceTableVisual; width: number; height: number }>): JSX.Element {
  const { colors } = identity;
  const rows = table.rows.length + 1;
  const fontSize = Math.max(16, Math.min(26, Math.floor(height / rows / 1.9)));
  return (
    <div
      aria-label={table.title ?? "Source table"}
      data-cinema-table={table.tableId}
      role="table"
      style={{
        display: "grid",
        fontFamily: identity.fonts.body,
        fontSize,
        gridTemplateColumns: `repeat(${table.columns.length}, minmax(0, 1fr))`,
        maxHeight: height,
        width,
      }}
    >
      {table.columns.map((column, index) => (
        <div
          key={`h-${index}`}
          role="columnheader"
          style={{ background: colors.accent, color: colors.onAccent, fontWeight: 700, overflowWrap: "anywhere", padding: fontSize * 0.45 }}
        >
          {column}
        </div>
      ))}
      {table.rows.map((row, rowIndex) =>
        row.map((cell, columnIndex) => (
          <div
            key={`${rowIndex}-${columnIndex}`}
            role="cell"
            style={{
              background: rowIndex % 2 === 0 ? colors.surface : colors.background,
              borderTop: `1px solid ${colors.line}`,
              color: colors.text,
              overflowWrap: "anywhere",
              padding: fontSize * 0.45,
            }}
          >
            {cell}
          </div>
        )),
      )}
    </div>
  );
}
