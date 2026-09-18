/**
 * ST-095 — the evaporation recipe: surface to vapour.
 *
 * What the motion has to carry, and what the drawing is arranged around:
 *
 * - A particle that leaves the liquid is the *same* particle afterwards. It
 *   keeps its fill, its size and its identity marker; only its position and a
 *   thin outline change. Fading one out and a different one in would be the
 *   easy version and would teach that water is destroyed.
 * - Nothing disappears. The vapour space is on screen throughout, so an
 *   escaped particle is always somewhere the learner can see it.
 * - The magnified view is labelled as a model, every frame, by the asset
 *   itself rather than by a caption that might scroll past.
 * - Dispersion spreads particles outward from where they entered, so "more
 *   spread out" is legible as a change to the same objects.
 */

import type { JSX } from "react";
import { videoTheme } from "@avlp/design-system/video-theme";
import type {
  DemonstrationAsset,
  DemonstrationPlan,
} from "@avlp/schemas/demonstration-proof";
import {
  demonstrationContentBottom,
  emphasisRing,
  rect,
  slotRect,
  transitPoint,
  type Rect,
} from "../geometry.js";
import {
  ExplanatoryObject,
  NoteStrip,
  RegionFrame,
  SceneTitle,
} from "../primitives.js";
import type {
  CompiledDemonstrationPlan,
  DemonstrationFrameState,
} from "../state.js";

/**
 * The authored stage.
 *
 * The two regions sit inside the model panel, each with its heading above its
 * own frame, and the gap between them is the lower heading's room rather than
 * decoration.
 *
 * The vapour region starts well below the panel's top edge because the panel
 * asset carries its own "MAGNIFIED MODEL" chip there. That chip is text baked
 * into an SVG, so the browser preflight — which measures DOM boxes — cannot
 * see it: the first layout ran the vapour heading straight through it, and
 * only watching the finished clip showed the collision.
 */
const stage = Object.freeze({
  vessel: rect(144, 250, 520, 430),
  model: rect(736, 180, 1040, 560),
  vapour: rect(776, 292, 960, 168),
  liquid: rect(776, 532, 960, 168),
  note: rect(736, 764, 1040, 92),
  legend: rect(144, 706, 520, 150),
});

const PARTICLE_SIZE = 46;

function particleCenter(
  area: Rect,
  capacity: number,
  slot: number,
): Readonly<{ x: number; y: number }> {
  const cell = slotRect(area, capacity, slot, {
    aspect: 1,
    gap: 10,
    padding: 24,
  });
  return Object.freeze({
    x: cell.x + cell.width / 2,
    y: cell.y + cell.height / 2,
  });
}

/**
 * Dispersion pushes a particle away from the centre of the vapour space.
 *
 * Scaling outward from the middle keeps every particle's relative arrangement
 * — which is what makes it read as the same group spreading out, rather than
 * as the particles being rearranged into a new pattern.
 */
function disperse(
  point: Readonly<{ x: number; y: number }>,
  area: Rect,
  dispersion: number,
  jitter: Readonly<{ x: number; y: number }>,
): Readonly<{ x: number; y: number }> {
  const middleX = area.x + area.width / 2;
  const middleY = area.y + area.height / 2;
  const spread = 1 + dispersion * 0.22;
  const x = middleX + (point.x - middleX) * spread + jitter.x * dispersion * 26;
  const y = middleY + (point.y - middleY) * spread + jitter.y * dispersion * 12;
  /**
   * Clamped inside the vapour region, with room for the particle's own radius.
   *
   * Found by the browser preflight rather than by reading the code: at full
   * dispersion the outermost particles were pushed past the canvas edge, which
   * would have shown water leaving the picture entirely — the opposite of what
   * this scene is meant to teach. Spreading is bounded by the space it
   * happens in.
   */
  const margin = PARTICLE_SIZE / 2 + 4;
  return Object.freeze({
    x: Math.min(
      area.x + area.width - margin,
      Math.max(area.x + margin, x),
    ),
    y: Math.min(
      area.y + area.height - margin,
      Math.max(area.y + margin, y),
    ),
  });
}

export function EvaporationRecipe({
  assets,
  compiled,
  plan,
  state,
  title,
}: Readonly<{
  assets: Readonly<Record<string, DemonstrationAsset>>;
  compiled: CompiledDemonstrationPlan;
  plan: DemonstrationPlan;
  state: DemonstrationFrameState;
  title: string;
}>): JSX.Element {
  const vessel = assets.vessel;
  const magnifier = assets.magnifier;
  const regions = plan.initialState.objects.filter(
    (object) => object.kind === "region",
  );
  const liquidRegion = regions.find((region) => region.role === "liquid-body");
  const vapourRegion = regions.find((region) => region.role === "vapour-space");
  const note = state.notes.find((entry) => entry.reveal > 0);

  /**
   * A region's place on the stage, resolved through the role it declares.
   *
   * Written as a role lookup rather than "is it the vapour region, else the
   * liquid one" so a third region cannot quietly land on top of the liquid
   * body. `placements` in the registry states there is room for one of each,
   * and both the support query and the plan validator refuse a plan with more.
   */
  const roleById = new Map(
    regions.map((region) => [region.id, region.role]),
  );
  const areaFor = (holderId: string): Rect =>
    roleById.get(holderId) === "vapour-space" ? stage.vapour : stage.liquid;

  return (
    <>
      <SceneTitle text={title} />

      {vessel === undefined ? null : (
        <img
          alt={vessel.altText}
          src={vessel.src}
          style={{
            height: stage.vessel.height,
            left: stage.vessel.x,
            objectFit: "contain",
            position: "absolute",
            top: stage.vessel.y,
            width: stage.vessel.width,
          }}
        />
      )}

      {magnifier === undefined ? null : (
        <img
          alt={magnifier.altText}
          src={magnifier.src}
          style={{
            height: stage.model.height,
            left: stage.model.x,
            objectFit: "fill",
            position: "absolute",
            top: stage.model.y,
            width: stage.model.width,
          }}
        />
      )}

      <RegionFrame
        area={stage.vapour}
        emphasis={state.emphasisByObjectId[vapourRegion?.id ?? "vapour"] ?? 0}
        label={vapourRegion?.label ?? "Air above the water"}
        regionId={vapourRegion?.id ?? "vapour"}
        tone="quiet"
      />
      <RegionFrame
        area={stage.liquid}
        emphasis={state.emphasisByObjectId[liquidRegion?.id ?? "liquid"] ?? 0}
        label={liquidRegion?.label ?? "Water"}
        regionId={liquidRegion?.id ?? "liquid"}
        tone="accent"
      />

      {state.particles.map((particle) => {
        const emphasis = emphasisRing(particle.emphasis);
        const home = particleCenter(
          areaFor(particle.holderId),
          compiled.regionCapacity[particle.holderId] ?? 1,
          particle.slot,
        );
        let point =
          particle.phase === "vapour"
            ? disperse(
                home,
                stage.vapour,
                particle.dispersion,
                particle.jitter,
              )
            : home;

        if (particle.transit !== undefined) {
          const from = particleCenter(
            areaFor(particle.transit.fromHolderId),
            compiled.regionCapacity[particle.transit.fromHolderId] ?? 1,
            particle.transit.fromSlot,
          );
          const to = particleCenter(
            areaFor(particle.transit.toHolderId),
            compiled.regionCapacity[particle.transit.toHolderId] ?? 1,
            particle.transit.toSlot,
          );
          const travelling = transitPoint(
            rect(from.x, from.y, 1, 1),
            rect(to.x, to.y, 1, 1),
            particle.transit.progress,
          );
          point = { x: travelling.x, y: travelling.y };
        }

        const escaped = particle.phase === "vapour" || particle.transit !== undefined;
        return (
          <ExplanatoryObject
            key={particle.id}
            objectId={particle.id}
            style={{
              height: PARTICLE_SIZE,
              left: point.x - PARTICLE_SIZE / 2,
              top: point.y - PARTICLE_SIZE / 2 + emphasis.offsetY,
              width: PARTICLE_SIZE,
              zIndex: particle.transit === undefined ? 3 : 6,
            }}
          >
            <div
              style={{
                // Identical fill before and after: the particle is still water.
                // Only the outline changes, marking that it is now free.
                background: videoTheme.colors.primary,
                border: escaped
                  ? `3px solid ${videoTheme.colors.accent}`
                  : `3px solid ${videoTheme.colors.primary}`,
                borderRadius: "50%",
                boxShadow:
                  emphasis.glow > 0
                    ? `0 0 0 ${5 * emphasis.glow}px ${videoTheme.colors.accent}55`
                    : "none",
                boxSizing: "border-box",
                height: "100%",
                width: "100%",
              }}
            />
          </ExplanatoryObject>
        );
      })}

      <div
        style={{
          left: stage.legend.x,
          position: "absolute",
          top: stage.legend.y,
          width: stage.legend.width,
        }}
      >
        <p
          data-testid="demo-legend"
          style={{
            color: videoTheme.colors.mutedText,
            fontFamily: videoTheme.typography.fontFamily,
            fontSize: 26,
            lineHeight: videoTheme.typography.lineHeight,
            margin: 0,
          }}
        >
          Each circle is one water particle. The outlined ones have left the
          liquid — they are still water.
        </p>
      </div>

      {note === undefined ? null : (
        <NoteStrip
          area={rect(
            stage.note.x,
            Math.min(stage.note.y, demonstrationContentBottom - stage.note.height),
            stage.note.width,
            stage.note.height,
          )}
          reveal={note.reveal}
          text={note.text}
        />
      )}
    </>
  );
}
