"use client";

/**
 * ST-094 — development-only creative-style proof gallery.
 *
 * A development tool, not a customer-facing gallery: `docs/design.md` §10.14
 * asks such a route for a simple Studio Daylight shell, clear fixture
 * selectors and a large preview, which is the structure below. Application
 * brand styling stays in the shell and is deliberately kept out of the
 * rendered scenes, which carry only their own pack's tokens.
 *
 * It exists so the nine treatments, their motion and their validation failures
 * can be reviewed in a browser, not to ship a style picker. Production lessons
 * remain single-theme (`mvp-default`), and nothing here is persisted.
 */

import { useMemo, useState, type CSSProperties } from "react";
import { Button } from "../../components/ui/button";
import { Notice } from "../../components/ui/notice";
import { PageContainer } from "../../components/layout/page-container";
import {
  conductionProofFixtures,
  denseComparisonBoundaryFixture,
  extendedSceneBoundaryFixture,
  getStyleProofIntervals,
  leafProofFixtures,
  longHeadingBoundaryFixture,
  mismatchedTreatmentFixture,
  missingAssetBoundaryFixture,
  portraitMediaBoundaryFixture,
  prepareStyleProofComposition,
  shortSceneBoundaryFixture,
  StyleProofPreviewPlayer,
  styleProofTimeline,
  styleProofTreatments,
  undersizedMediaBoundaryFixture,
} from "@avlp/scene-library/style-proof";
import { styleProofPacks } from "@avlp/design-system/style-proof-tokens";
import type { StyleProofPackId } from "@avlp/schemas/style-proof";

const packIds: readonly StyleProofPackId[] = ["essential", "editorial", "everyday"];

const subjects = {
  conduction: {
    label: "Heat conduction (primary)",
    fixtures: conductionProofFixtures,
  },
  leaf: { label: "Leaf adaptation (second subject)", fixtures: leafProofFixtures },
} as const;

type SubjectId = keyof typeof subjects;

const boundaryCases = [
  {
    id: "long-heading",
    label: "Heading at the schema ceiling",
    fixture: longHeadingBoundaryFixture,
  },
  {
    id: "dense-comparison",
    label: "Densest valid comparison",
    fixture: denseComparisonBoundaryFixture,
  },
  {
    id: "portrait-media",
    label: "Portrait media in a cover-fit slot",
    fixture: portraitMediaBoundaryFixture,
  },
  {
    id: "extended-scene",
    label: "Extended scene duration",
    fixture: extendedSceneBoundaryFixture,
  },
  {
    id: "missing-asset",
    label: "Missing required evidence (must block)",
    fixture: missingAssetBoundaryFixture,
  },
  {
    id: "undersized-media",
    label: "Media below minimum resolution (must block)",
    fixture: undersizedMediaBoundaryFixture,
  },
  {
    id: "short-scene",
    label: "Scene too short to hold (must block)",
    fixture: shortSceneBoundaryFixture,
  },
  {
    id: "mismatched-treatment",
    label: "Treatment/scene-type mismatch (must block)",
    fixture: mismatchedTreatmentFixture,
  },
] as const;

const panel: CSSProperties = {
  background: "var(--color-surface-raised, #FFFFFF)",
  border: "1px solid var(--color-border-subtle, #CBD5E1)",
  borderRadius: 12,
  marginTop: 16,
  padding: 16,
};

export default function StyleProofPreviewPage() {
  const [packId, setPackId] = useState<StyleProofPackId>("essential");
  const [subjectId, setSubjectId] = useState<SubjectId>("conduction");
  const [boundaryId, setBoundaryId] = useState<string>();
  const [frame, setFrame] = useState(0);

  const boundary = boundaryCases.find((entry) => entry.id === boundaryId);
  const input = boundary?.fixture ?? subjects[subjectId].fixtures[packId];
  const prepared = useMemo(() => prepareStyleProofComposition(input), [input]);
  const timeline = useMemo(() => styleProofTimeline(input.scenes), [input]);

  const activeSegment = timeline.find(
    (segment) =>
      frame >= segment.startFrame && frame < segment.endFrameExclusive,
  );
  const activeScene = input.scenes.find(
    (scene) => scene.id === activeSegment?.sceneId,
  );
  const activeDesign =
    activeScene === undefined
      ? undefined
      : input.selection.sceneDesigns[activeScene.id];
  const activePack = styleProofPacks[input.selection.pack.id];

  return (
    <div className="theme-studio-daylight">
      <PageContainer maxWidth="1200px">
        <main data-testid="style-proof-gallery">
          <h1>Creative style proof (ST-094)</h1>
          <Notice
            type="info"
            title="Development tool"
            message="A development proof of three style packs over identical lesson content. Saved lessons still render with the single mvp-default theme, and nothing here is persisted."
          />

      <section aria-label="Style pack" style={{ marginTop: 16 }}>
        <h2>Style</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {packIds.map((id) => (
            <Button
              aria-pressed={packId === id && boundaryId === undefined}
              key={id}
              onClick={() => {
                setPackId(id);
                setBoundaryId(undefined);
              }}
              size="compact"
              type="button"
              variant={packId === id && boundaryId === undefined ? "primary" : "secondary"}
            >
                {styleProofPacks[id].label}
            </Button>
          ))}
        </div>
        <p data-testid="style-proof-signature">
          Motion signature: {activePack.motionSignature} —{" "}
          {activePack.motionSignatureDescription}
        </p>
      </section>

      <section aria-label="Subject" style={{ marginTop: 16 }}>
        <h2>Subject</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {(Object.keys(subjects) as SubjectId[]).map((id) => (
            <Button
              aria-pressed={subjectId === id && boundaryId === undefined}
              key={id}
              onClick={() => {
                setSubjectId(id);
                setBoundaryId(undefined);
              }}
              size="compact"
              type="button"
              variant={subjectId === id && boundaryId === undefined ? "primary" : "secondary"}
            >
                {subjects[id].label}
            </Button>
          ))}
        </div>
      </section>

      <section aria-label="Boundary fixtures" style={{ marginTop: 16 }}>
        <h2>Boundary fixtures</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {boundaryCases.map((entry) => (
            <Button
              aria-pressed={boundaryId === entry.id}
              key={entry.id}
              onClick={() => setBoundaryId(entry.id)}
              size="compact"
              type="button"
              variant={boundaryId === entry.id ? "primary" : "secondary"}
            >
                {entry.label}
            </Button>
          ))}
        </div>
      </section>

      <section aria-label="Proof playback" style={{ marginTop: 24 }}>
        <h2>
          {boundary?.label ??
            `${styleProofPacks[packId].label} — ${subjects[subjectId].label}`}
        </h2>
        <StyleProofPreviewPlayer input={input} onFrameChange={setFrame} />
        {activeScene === undefined || activeDesign === undefined ? null : (
          <div data-testid="style-proof-resolution" style={panel}>
            <p>
              Scene <code>{activeScene.template}</code> resolved to{" "}
              <code>{activeDesign.treatmentId}</code> v
              {activeDesign.treatmentVersion} from pack{" "}
              <code>{input.selection.pack.id}</code> v
              {input.selection.pack.version}.
            </p>
            <p>
              Intervals at {activeScene.durationSeconds}s:{" "}
              {JSON.stringify(
                getStyleProofIntervals(
                  activeScene.durationSeconds,
                  input.motion,
                ),
              )}
            </p>
          </div>
        )}
        <p data-testid="style-proof-status">
          {prepared.props === undefined
            ? `Blocked: ${prepared.issues.map((issue) => issue.code).join(", ")}`
            : "Renderable"}
        </p>
      </section>

      <section aria-label="Registered treatments" style={{ marginTop: 24 }}>
        <h2>Registered treatments</h2>
        <ul>
          {styleProofTreatments.map((treatment) => (
            <li key={treatment.id}>
              <code>{treatment.id}</code> v{treatment.version} —{" "}
              {treatment.description} Slots:{" "}
              {treatment.assetSlots
                .map(
                  (slot) =>
                    `${slot.slot} (${slot.acceptedKinds.join("/")}, ${slot.fit}, min ${slot.minWidth}x${slot.minHeight}${slot.required ? ", required" : ""})`,
                )
                .join("; ")}
            </li>
          ))}
        </ul>
      </section>
        </main>
      </PageContainer>
    </div>
  );
}
