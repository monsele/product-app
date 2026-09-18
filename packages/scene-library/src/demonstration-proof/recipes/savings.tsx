/**
 * ST-095 — the savings recipe: transfer and accumulate.
 *
 * The rule this component follows throughout: it draws what the evaluated
 * state says and computes nothing about the money itself. Balances come from
 * `state.ledger`, positions come from the stable slot the runtime assigns, and
 * the in-transit amount is drawn explicitly rather than being folded into
 * either container. If the arithmetic were wrong, it would be wrong in the
 * validator first, and the plan would never have rendered.
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
  formatNaira,
  rect,
  slotRect,
  transitPoint,
  type Rect,
} from "../geometry.js";
import {
  ExplanatoryObject,
  NoteStrip,
  Readout,
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
 * Fixed rectangles, chosen once for this recipe. They are constants rather
 * than inputs precisely because a plan may not address layout: an author moves
 * money between containers, and the recipe decides where a container is.
 */
const stage = Object.freeze({
  origin: rect(144, 190, 880, 140),
  income: rect(144, 388, 880, 276),
  savings: rect(1096, 388, 680, 276),
  // The goal readout stacks a label, a value, a progress bar and a goal line,
  // which the browser preflight measured at ~155px. The first layout put it at
  // y=726 and it crossed the caption band — caught by measurement rather than
  // by arithmetic, which is why the preflight measures in a real browser.
  incomeReadout: rect(144, 682, 420, 160),
  savingsReadout: rect(1096, 682, 420, 160),
  note: rect(600, 694, 460, 150),
});

const TOKEN_ASPECT = 320 / 200;

/**
 * One note is one size, everywhere.
 *
 * Sizing purely from the cell made a note grow as it landed, because the
 * savings tray holds fewer notes than the income tray and so has bigger cells.
 * The render showed it plainly: the same ₦1,000 note arrived visibly larger
 * than it left, which reads as the money changing rather than moving. Object
 * continuity is an acceptance criterion, so the cell now bounds the note from
 * above and this constant bounds it from above as well.
 */
const MAX_TOKEN_WIDTH = 150;

const slotOptions = { aspect: TOKEN_ASPECT, gap: 12, padding: 22 } as const;

/** The widest note that fits every holder this plan uses. */
function cellWidthFor(area: Rect, capacity: number): number {
  const cell = slotRect(area, capacity, 0, slotOptions);
  return Math.min(cell.width, cell.height * TOKEN_ASPECT, MAX_TOKEN_WIDTH);
}

/**
 * One width for the whole scene, taken as the smallest any holder can afford.
 *
 * Sizing each note to its own cell left the savings tray — which holds fewer
 * notes and so has larger cells — drawing the *same* note noticeably bigger
 * than the income tray did. Taking the minimum across holders costs a little
 * empty space in the roomier tray and buys the thing that actually matters:
 * a note that is the same note before and after it moves.
 */
function uniformTokenWidth(
  capacities: Readonly<Record<string, number>>,
  rectFor: (holderId: string) => Rect,
): number {
  const widths = Object.entries(capacities).map(([holderId, capacity]) =>
    cellWidthFor(rectFor(holderId), capacity),
  );
  return widths.length === 0 ? MAX_TOKEN_WIDTH : Math.min(...widths);
}

function tokenBox(
  area: Rect,
  capacity: number,
  slot: number,
  width: number,
): Rect {
  const cell = slotRect(area, capacity, slot, slotOptions);
  // The note keeps its own aspect ratio; a squashed banknote reads as a
  // different denomination.
  const height = width / TOKEN_ASPECT;
  return rect(
    cell.x + (cell.width - width) / 2,
    cell.y + (cell.height - height) / 2,
    width,
    height,
  );
}

/**
 * The stage place each container role occupies.
 *
 * Keyed by role, never by container ID. An earlier version mapped the fixture's
 * own IDs — `income` and `savings` — to these rectangles and fell back to the
 * origin strip for anything else, which meant a plan using different IDs for
 * the same roles validated, reported as supported, and then drew every
 * container in one place with the tokens overlapping, while the readouts went
 * on reporting the correct balances. The recipe owns layout, so layout must
 * follow the role the plan declares and nothing the plan happens to be named.
 *
 * `placements` in the registry states how many containers of each role there is
 * room for, and both the support query and the plan validator refuse a plan
 * that brings more; this map is the other half of that contract.
 */
const roleRect: Readonly<Record<string, Rect>> = Object.freeze({
  origin: stage.origin,
  source: stage.income,
  destination: stage.savings,
});

export function SavingsRecipe({
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
  const coin = assets.coin;
  const jar = assets["savings-jar"];
  const containers = plan.initialState.objects.filter(
    (object) => object.kind === "container",
  );
  const originContainer = containers.find(
    (container) => container.role === "origin",
  );
  const sourceContainer = containers.find(
    (container) => container.role === "source",
  );
  const destinationContainer = containers.find(
    (container) => container.role === "destination",
  );
  const period = state.periods[0];
  const note = state.notes.find((entry) => entry.reveal > 0);

  /**
   * A container's place on the stage, resolved through the role it declares.
   *
   * The fallback is the origin strip only for a holder the plan does not
   * declare at all, which validation already refuses; it exists so a partially
   * constructed plan in a preview cannot throw mid-frame.
   */
  const roleById = new Map(
    containers.map((container) => [container.id, container.role]),
  );
  const rectFor = (holderId: string): Rect =>
    roleRect[roleById.get(holderId) ?? ""] ?? stage.origin;

  const tokenWidth = uniformTokenWidth(compiled.containerCapacity, rectFor);

  /**
   * In-transit money is stated rather than hidden, on the heading row of the
   * tray it is actually heading for. While notes are between two trays they
   * belong to neither balance, and saying so is the only way the two readouts
   * can be trusted not to have quietly lost or duplicated the amount.
   */
  const arriving = (containerId: string): string | undefined => {
    const amount = state.ledger.inTransitByDestination[containerId] ?? 0;
    return amount > 0 ? `${formatNaira(amount)} arriving` : undefined;
  };

  return (
    <>
      <SceneTitle periodLabel={period?.periodLabel} text={title} />

      {/*
        The origin tray states how much is still to come, and says so when it
        is empty. Without that line a drained tray reads as a rendering fault
        rather than as "all of this week's wages have been paid in" — and the
        whole point of an origin container is that the learner can see where
        the money came from.

        It sits directly above the income tray and is the same width, so wages
        arriving read as a straight drop into the tray below rather than a
        diagonal across the canvas.
      */}
      {originContainer === undefined ? null : (
        <RegionFrame
          area={stage.origin}
          label={originContainer.label}
          regionId={originContainer.id}
          status={
            (state.ledger.settledByContainer[originContainer.id] ?? 0) === 0
              ? "All paid in"
              : `${formatNaira(state.ledger.settledByContainer[originContainer.id] ?? 0)} still to come`
          }
          tone="quiet"
        />
      )}
      {/*
        Both trays are addressed by the container the plan declares for the
        role, so emphasis, the in-transit line and the preflight's object ID
        all follow the plan rather than a name this recipe hopes to find.
      */}
      <RegionFrame
        area={stage.income}
        emphasis={
          sourceContainer === undefined
            ? 0
            : (state.emphasisByObjectId[sourceContainer.id] ?? 0)
        }
        label={sourceContainer?.label ?? "Income"}
        regionId={sourceContainer?.id ?? "income"}
        status={
          sourceContainer === undefined ? undefined : arriving(sourceContainer.id)
        }
      />
      <RegionFrame
        area={stage.savings}
        label={destinationContainer?.label ?? "Savings"}
        emphasis={
          destinationContainer === undefined
            ? 0
            : (state.emphasisByObjectId[destinationContainer.id] ?? 0)
        }
        icon={
          jar === undefined ? undefined : { alt: jar.altText, src: jar.src }
        }
        regionId={destinationContainer?.id ?? "savings"}
        status={
          destinationContainer === undefined
            ? undefined
            : arriving(destinationContainer.id)
        }
        tone="accent"
      />

      {state.tokens.map((token) => {
        const emphasis = emphasisRing(token.emphasis);
        const home = tokenBox(
          rectFor(token.holderId),
          compiled.containerCapacity[token.holderId] ?? 1,
          token.slot,
          tokenWidth,
        );
        let box = home;
        if (token.transit !== undefined) {
          const from = tokenBox(
            rectFor(token.transit.fromHolderId),
            compiled.containerCapacity[token.transit.fromHolderId] ?? 1,
            token.transit.fromSlot,
            tokenWidth,
          );
          const to = tokenBox(
            rectFor(token.transit.toHolderId),
            compiled.containerCapacity[token.transit.toHolderId] ?? 1,
            token.transit.toSlot,
            tokenWidth,
          );
          const point = transitPoint(from, to, token.transit.progress);
          box = rect(
            point.x - to.width / 2,
            point.y - to.height / 2,
            to.width,
            to.height,
          );
        }
        // A settled token drifts by at most three pixels from its slot, so ten
        // of them do not look machine-stamped; the offset is seeded per token
        // and constant for the whole clip, never a per-frame wobble.
        const drift = token.transit === undefined ? 3 : 0;
        return (
          <ExplanatoryObject
            key={token.id}
            objectId={token.id}
            style={{
              height: box.height,
              left: box.x + token.jitter.x * drift,
              top: box.y + token.jitter.y * drift + emphasis.offsetY,
              width: box.width,
              // Elevation while travelling, so a moving note is unambiguously
              // in front of both trays rather than clipped by one of them.
              zIndex: token.transit === undefined ? 2 : 5,
            }}
          >
            {coin === undefined ? null : (
              <img
                alt={coin.altText}
                src={coin.src}
                style={{
                  borderRadius: 10,
                  boxShadow:
                    emphasis.glow > 0
                      ? `0 0 0 ${4 * emphasis.glow}px ${videoTheme.colors.primary}`
                      : "none",
                  display: "block",
                  height: "100%",
                  objectFit: "contain",
                  width: "100%",
                }}
              />
            )}
          </ExplanatoryObject>
        );
      })}

      {/*
        Placed by what each readout reads, not by its position in the array.
        Indexing positionally would put the savings balance under the income
        tray the moment an author listed the readouts the other way round —
        and it would look entirely plausible.
      */}
      {plan.initialState.readouts.map((readout) => {
        const container = containers.find(
          (entry) => entry.id === readout.containerId,
        );
        return (
          <Readout
            area={
              container?.role === "destination"
                ? stage.savingsReadout
                : stage.incomeReadout
            }
            format={formatNaira}
            goalMinor={readout.goalMinor}
            key={readout.id}
            label={readout.label}
            valueMinor={state.ledger.settledByContainer[readout.containerId] ?? 0}
          />
        );
      })}

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
