/**
 * The secondary validated content of headline-led scenes (hook, definition,
 * analogy, summary), sized to a height budget. Every item is rendered; a
 * composition's eligibility rules cap the counts so the budget always holds.
 */
import type { SceneSpec } from "@avlp/schemas";
import type { JSX } from "react";
import { arrival, useCinemaBeats } from "../beats.js";
import type { CinemaIdentity } from "../identity.js";
import { BodyText, NumberBadge, Surface } from "../primitives.js";
import { estimateLines, fitText } from "../text-fit.js";

type DetailLine = Readonly<{ text: string; target: string; numbered?: number; strong?: boolean }>;

/** The items and lead text a detail block shows for a scene. */
export function detailContent(scene: SceneSpec): Readonly<{
  lead?: string | undefined;
  leadLabel?: string | undefined;
  lines: readonly DetailLine[];
  chips: readonly DetailLine[];
  closing?: string | undefined;
}> {
  switch (scene.template) {
    case "hook":
      return {
        lead: scene.visual.prompt,
        lines: [],
        chips: (scene.visual.supportingElements ?? []).map((text, index) => ({ text, target: `item-${index + 1}` })),
      };
    case "definition":
      return {
        lead: scene.visual.definition,
        leadLabel: scene.visual.exampleLabel,
        lines:
          scene.visual.exampleText === undefined
            ? []
            : [{ text: `${scene.visual.exampleLabel ?? "Example"}: ${scene.visual.exampleText}`, target: "detail" }],
        chips: [],
      };
    case "analogy":
      return {
        lead: `${scene.visual.sourceConcept} is like ${scene.visual.familiarSystem}.`,
        lines: scene.visual.mappings.map((mapping, index) => ({
          text: `${mapping.concept} → ${mapping.analogy}`,
          target: `item-${index + 1}`,
        })),
        chips: [],
      };
    case "summary":
      return {
        lead: scene.visual.centralModel,
        lines: scene.visual.takeaways.map((takeaway, index) => ({
          text: takeaway.text,
          target: `item-${index + 1}`,
          numbered: index + 1,
        })),
        chips: [],
        closing: scene.visual.callToAction,
      };
    default:
      return { lines: [], chips: [] };
  }
}

/** Estimated height of a detail block at a body size. */
function detailHeight(
  identity: CinemaIdentity,
  content: ReturnType<typeof detailContent>,
  width: number,
  size: number,
): number {
  const line = (text: string, textSize: number, textWidth = width) =>
    estimateLines(text, textSize, textWidth, identity.bodyWidth) * textSize * 1.3;
  let height = 0;
  if (content.lead !== undefined) height += line(content.lead, size + 4) + 16;
  for (const entry of content.lines)
    height += line(entry.text, size, width - (entry.numbered === undefined ? 0 : 64)) + 14;
  if (content.chips.length > 0) height += size * 1.3 + 42;
  if (content.closing !== undefined) height += line(content.closing, size - 2, width - 48) + 48;
  return height;
}

/** The largest body size at which the detail block fits its budget. */
export function detailFontSize(
  identity: CinemaIdentity,
  scene: SceneSpec,
  width: number,
  maxHeight: number,
  maxSize = 38,
): number {
  const content = detailContent(scene);
  for (let size = maxSize; size >= 24; size -= 2)
    if (detailHeight(identity, content, width, size) <= maxHeight) return size;
  return 24;
}

export function estimatedDetailHeight(
  identity: CinemaIdentity,
  scene: SceneSpec,
  width: number,
  size: number,
): number {
  return detailHeight(identity, detailContent(scene), width, size);
}

export function SceneDetail({
  identity,
  scene,
  width,
  fontSize,
  align = "left",
}: Readonly<{
  identity: CinemaIdentity;
  scene: SceneSpec;
  width: number;
  fontSize: number;
  align?: "left" | "center";
}>): JSX.Element {
  const beats = useCinemaBeats();
  const content = detailContent(scene);
  const active = beats.activeItem(content.lines.length + content.chips.length);
  return (
    <div data-cinema-detail style={{ display: "grid", gap: 14, textAlign: align, width }}>
      {content.lead === undefined ? null : (
        <BodyText
          identity={identity}
          fontSize={fontSize + 4}
          style={{ ...arrival(beats.reveal("detail")), fontWeight: 600, marginBottom: 2 }}
        >
          {content.lead}
        </BodyText>
      )}
      {content.lines.map((line, index) => {
        const isActive = line.target === `item-${active}`;
        return (
          <div
            key={`${index}-${line.text}`}
            data-cinema-item={line.target}
            style={{
              alignItems: "center",
              display: "flex",
              gap: 16,
              justifyContent: align === "center" ? "center" : "flex-start",
              ...arrival(beats.reveal(line.target), "left", 20),
            }}
          >
            {line.numbered === undefined ? null : (
              <NumberBadge identity={identity} value={line.numbered} size={Math.max(48, Math.round(fontSize * 1.35))} active={isActive} />
            )}
            <BodyText
              identity={identity}
              fontSize={fontSize}
              muted={!isActive && line.target !== "detail"}
              style={{ fontWeight: isActive ? 700 : 500 }}
            >
              {line.text}
            </BodyText>
          </div>
        );
      })}
      {content.chips.length === 0 ? null : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: align === "center" ? "center" : "flex-start", marginTop: 8 }}>
          {content.chips.map((chip) => (
            <Surface
              key={chip.text}
              data-cinema-item={chip.target}
              identity={identity}
              active={chip.target === `item-${active}`}
              style={{ padding: "10px 22px", ...arrival(beats.reveal(chip.target)) }}
            >
              <BodyText identity={identity} fontSize={fontSize} style={{ fontWeight: 700 }}>
                {chip.text}
              </BodyText>
            </Surface>
          ))}
        </div>
      )}
      {content.closing === undefined ? null : (
        <Surface
          identity={identity}
          tone="accent"
          style={{ justifySelf: align === "center" ? "center" : "start", marginTop: 10, padding: "12px 24px", ...arrival(beats.reveal("detail")) }}
        >
          <BodyText
            identity={identity}
            fontSize={Math.max(24, fontSize - 2)}
            style={{
              color: identity.surface === "block" ? identity.colors.onAccent : identity.colors.text,
              fontWeight: 700,
            }}
          >
            {content.closing}
          </BodyText>
        </Surface>
      )}
    </div>
  );
}

/** Fit for a scene's primary text within a box. */
export function primaryFit(
  identity: CinemaIdentity,
  text: string,
  width: number,
  maxLines: number,
  maxSize: number,
  minSize: number,
  maxHeight?: number,
) {
  return fitText({
    text,
    width,
    maxLines,
    maxSize,
    minSize,
    glyphWidth: identity.displayWidth,
    lineHeight: 1.08,
    ...(maxHeight === undefined ? {} : { maxHeight }),
  });
}
