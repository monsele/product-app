"use client";

/**
 * ST-095 — development-only demonstration proof gallery.
 *
 * A development tool, not a customer-facing gallery: `docs/design.md` §10.14
 * asks such a route for a simple Studio Daylight shell, clear fixture
 * selectors and a large preview, which is the structure below. The application
 * brand styling stays in the shell and is deliberately kept out of the
 * rendered scenes, which carry only `mvp-default`.
 *
 * It exists so the two recipes, their state and their validation failures can
 * be reviewed side by side in a browser — not to ship an approach picker.
 * Selection, tenant-owned variants, paired playback and feedback are ST-096's.
 */

import { useMemo, useState, type CSSProperties } from "react";
import { Button } from "../../components/ui/button";
import { Notice } from "../../components/ui/notice";
import { PageContainer } from "../../components/layout/page-container";
import {
  compileDemonstrationPlan,
  demonstrationSubjects,
  demonstrationTimeline,
  DemonstrationPreviewPlayer,
  evaluateDemonstrationState,
  listDemonstrationRecipes,
  prepareDemonstrationComposition,
} from "@avlp/scene-library/demonstration-proof";
import { FullLessonPreviewPlayer } from "@avlp/scene-library";

type SubjectId = keyof typeof demonstrationSubjects;
type Approach = "demonstration" | "standard";

const subjectIds = Object.keys(demonstrationSubjects) as SubjectId[];

const panel: CSSProperties = {
  background: "var(--color-surface-raised, #FFFFFF)",
  border: "1px solid var(--color-border-subtle, #CBD5E1)",
  borderRadius: 12,
  marginTop: 16,
  padding: 16,
};

const formatNaira = (minor: number) =>
  `₦${Math.trunc(minor / 100).toLocaleString("en-NG")}`;

export default function DemonstrationProofGallery() {
  const [subjectId, setSubjectId] = useState<SubjectId>("savings");
  const [approach, setApproach] = useState<Approach>("demonstration");
  const [frame, setFrame] = useState(0);

  const subject = demonstrationSubjects[subjectId];
  const demonstration = subject.demonstration;
  const prepared = useMemo(
    () => prepareDemonstrationComposition(demonstration),
    [demonstration],
  );
  const timeline = useMemo(
    () => demonstrationTimeline(demonstration.scenes),
    [demonstration],
  );

  const segment = timeline.find(
    (entry) => frame >= entry.startFrame && frame < entry.endFrameExclusive,
  );
  const scene = demonstration.scenes.find(
    (entry) => entry.id === segment?.sceneId,
  );

  /**
   * The evaluated state at the frame on screen.
   *
   * Shown because it is the fastest way to check the claim this proof rests
   * on: the balances a viewer reads are the balances the runtime computed, and
   * money in transit is counted once, in neither container.
   */
  const state = useMemo(
    () =>
      scene === undefined || segment === undefined
        ? undefined
        : evaluateDemonstrationState(
            compileDemonstrationPlan(scene.plan),
            frame - segment.startFrame,
          ),
    [frame, scene, segment],
  );

  return (
    <div className="theme-studio-daylight">
      <PageContainer maxWidth="1200px">
        <main data-testid="demonstration-proof-gallery">
          <h1>Demonstration-led animation proof (ST-095)</h1>
          <Notice
            type="info"
            title="Development tool"
            message="A development proof of two demonstration recipes against the same facts, narration and captions as their standard equivalents. Saved lessons still render on their existing path, and nothing here is persisted."
          />

          <section aria-label="Subject" style={{ marginTop: 16 }}>
            <h2>Subject</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {subjectIds.map((id) => (
                <Button
                  aria-pressed={subjectId === id}
                  key={id}
                  onClick={() => {
                    setSubjectId(id);
                    setFrame(0);
                  }}
                  size="compact"
                  type="button"
                  variant={subjectId === id ? "primary" : "secondary"}
                >
                  {demonstrationSubjects[id].label}
                </Button>
              ))}
            </div>
          </section>

          <section aria-label="Approach" style={{ marginTop: 16 }}>
            <h2>Approach</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {(["demonstration", "standard"] as const).map((id) => (
                <Button
                  aria-pressed={approach === id}
                  key={id}
                  onClick={() => setApproach(id)}
                  size="compact"
                  type="button"
                  variant={approach === id ? "primary" : "secondary"}
                >
                  {id === "demonstration" ? "Demonstration" : "Standard"}
                </Button>
              ))}
            </div>
            <p data-testid="demonstration-approach-note">
              Both approaches use the same narration recording, the same caption
              cues and the same scene boundaries. Only the visual behaviour
              differs.
            </p>
          </section>

          <section aria-label="Preview" style={panel}>
            {approach === "demonstration" ? (
              <DemonstrationPreviewPlayer
                input={demonstration}
                onFrameChange={setFrame}
              />
            ) : (
              <FullLessonPreviewPlayer input={subject.standard.props} />
            )}
          </section>

          {approach === "demonstration" ? (
            <section aria-label="Evaluated state" style={panel}>
              <h2>Evaluated state at this frame</h2>
              {state === undefined || scene === undefined ? (
                <p>Seek into a scene to inspect its state.</p>
              ) : (
                <>
                  <p data-testid="demonstration-state-scene">
                    {scene.title} — recipe {scene.plan.recipe.id}@
                    {scene.plan.recipe.version}, seed {scene.plan.seed}
                  </p>
                  {state.tokens.length > 0 ? (
                    <p data-testid="demonstration-state-ledger">
                      {Object.entries(state.ledger.settledByContainer)
                        .map(
                          ([containerId, value]) =>
                            `${containerId}: ${formatNaira(value)}`,
                        )
                        .join(" · ")}
                      {" · in transit: "}
                      {formatNaira(state.ledger.inTransitMinor)}
                      {" · total: "}
                      {formatNaira(state.ledger.totalMinor)}
                    </p>
                  ) : null}
                  {state.particles.length > 0 ? (
                    <p data-testid="demonstration-state-particles">
                      {`liquid: ${state.particles.filter((entry) => entry.phase === "liquid").length}`}
                      {` · vapour: ${state.particles.filter((entry) => entry.phase === "vapour").length}`}
                      {` · total: ${state.particles.length} (all water)`}
                    </p>
                  ) : null}
                  {/*
                    Which events are mid-flight, and what the frame is asking
                    the viewer to look at. Scrub backwards and these must come
                    back identical — the quickest manual check that the runtime
                    has not become history-dependent.
                  */}
                  <p data-testid="demonstration-state-events">
                    {`active events: ${state.activeEventIds.join(", ") || "none"}`}
                    {` · focus: ${state.focusObjectIds.join(", ") || "none"}`}
                  </p>
                </>
              )}
            </section>
          ) : null}

          <section aria-label="Shared facts" style={panel}>
            <h2>Facts both clips must carry</h2>
            <ul data-testid="demonstration-facts">
              {subject.facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </section>

          <section aria-label="Validation" style={panel}>
            <h2>Validation</h2>
            {prepared.issues.length === 0 ? (
              <p data-testid="demonstration-validation">
                No blocking issues. Every plan replays with its declared totals,
                readable holds and beat anchors intact.
              </p>
            ) : (
              <ul data-testid="demonstration-validation">
                {prepared.issues.map((issue) => (
                  <li key={`${issue.fieldPath}:${issue.code}`}>
                    <strong>{issue.code}</strong> at {issue.fieldPath} —{" "}
                    {issue.message} {issue.suggestedCorrection}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Recipe catalogue" style={panel}>
            <h2>Registered recipes</h2>
            <ul data-testid="demonstration-recipes">
              {listDemonstrationRecipes().map((recipe) => (
                <li key={recipe.id}>
                  <strong>
                    {recipe.id}@{recipe.version}
                  </strong>{" "}
                  — {recipe.description} Requires at least{" "}
                  {recipe.timing.minimumSceneSeconds}s and {" "}
                  {recipe.timing.minimumHoldFrames} settled frames per change.
                </li>
              ))}
            </ul>
          </section>
        </main>
      </PageContainer>
    </div>
  );
}
