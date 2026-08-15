export type SectionSelectionAction =
  | { kind: "include" }
  | { kind: "exclude" }
  | { kind: "rename"; heading: string }
  | { kind: "restore" };

export interface SectionSelectionSnapshot {
  revision: number;
  included: boolean;
  displayHeading: string | null;
}

export interface SectionSelectionUpdate {
  revision: number;
  included?: boolean;
  displayHeading?: string | null;
  reviewOrder?: number | null;
}

/**
 * Maps a teacher UI action onto the `PATCH /source-sections/:sectionId` body.
 * `revision` is carried through for optimistic concurrency; `restore` reverts
 * the section to its original included/heading/order state.
 */
export function buildSectionUpdateInput(
  current: SectionSelectionSnapshot,
  action: SectionSelectionAction,
): SectionSelectionUpdate {
  switch (action.kind) {
    case "include":
      return { revision: current.revision, included: true };
    case "exclude":
      return { revision: current.revision, included: false };
    case "rename":
      return { revision: current.revision, displayHeading: action.heading };
    case "restore":
      return {
        revision: current.revision,
        included: true,
        displayHeading: null,
        reviewOrder: null,
      };
  }
}
