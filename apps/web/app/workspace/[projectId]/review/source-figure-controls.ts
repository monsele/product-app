export type FigureSelectionAction = { kind: "exclude" } | { kind: "restore" };

export interface FigureSelectionSnapshot {
  revision: number;
  included: boolean;
}

export interface FigureSelectionUpdate {
  revision: number;
  included: boolean;
}

/**
 * Maps a teacher UI action onto the `PATCH /source-figures/:figureId` body.
 * `revision` is carried through for optimistic concurrency; `restore` re-includes
 * the figure while keeping the overlay revision for a conflict-free update.
 */
export function buildFigureUpdateInput(
  current: FigureSelectionSnapshot,
  action: FigureSelectionAction,
): FigureSelectionUpdate {
  switch (action.kind) {
    case "exclude":
      return { revision: current.revision, included: false };
    case "restore":
      return { revision: current.revision, included: true };
  }
}
