"use client";

import React, { useState } from "react";
import type { StoryboardSceneListEntry } from "@avlp/schemas";
import { BrandLogo } from "../../components/brand/brand-logo";
import { BrandMark } from "../../components/brand/brand-mark";
import { LessonReel } from "../../components/brand/lesson-reel";
import { LoadingImage } from "../../components/brand/loading-image";
import {
  OnionSkinLoader,
  PageLoading,
} from "../../components/brand/onion-skin-loader";
import { SceneList } from "../workspace/[projectId]/storyboard/scene-list";
import { SceneTimeline } from "../workspace/[projectId]/storyboard/scene-timeline";

const ready = {
  assets: "resolved",
  audio: "ready",
  captions: "ready",
  validation: "ok",
  stale: false,
} as const;

/** Preview data shaped like the storyboard API, based on the science fixture. */
const PREVIEW_SCENES: StoryboardSceneListEntry[] = [
  {
    sceneId: "019ffbf1-a000-7000-8000-0000000000a1",
    order: 1,
    template: "hook",
    title: "How does a plant make food?",
    narrationSummary: "Plants cannot walk to a kitchen, so where does their food come from?",
    narrationBlockCount: 1,
    durationSeconds: 18,
    status: ready,
  },
  {
    sceneId: "019ffbf1-a000-7000-8000-0000000000a2",
    order: 2,
    template: "definition",
    title: "Photosynthesis",
    narrationSummary: "The process plants use to make glucose using light energy.",
    narrationBlockCount: 1,
    durationSeconds: 24,
    status: ready,
  },
  {
    sceneId: "019ffbf1-a000-7000-8000-0000000000a3",
    order: 3,
    template: "input-process-output",
    title: "The photosynthesis system",
    narrationSummary: "Sunlight, water and carbon dioxide go in; glucose and oxygen come out.",
    narrationBlockCount: 2,
    durationSeconds: 36,
    status: { ...ready, captions: "pending" },
  },
  {
    sceneId: "019ffbf1-a000-7000-8000-0000000000a4",
    order: 4,
    template: "process",
    title: "Collect the ingredients",
    narrationSummary: "Leaves collect sunlight, roots absorb water, leaves take in carbon dioxide.",
    narrationBlockCount: 2,
    durationSeconds: 30,
    status: { ...ready, audio: "not_generated", captions: "not_generated" },
  },
  {
    sceneId: "019ffbf1-a000-7000-8000-0000000000a5",
    order: 5,
    template: "cause-effect",
    title: "Why the products matter",
    narrationSummary: "Glucose stores energy, so the plant can grow.",
    narrationBlockCount: 1,
    durationSeconds: 21,
    status: ready,
  },
  {
    sceneId: "019ffbf1-a000-7000-8000-0000000000a6",
    order: 6,
    template: "summary",
    title: "Remember photosynthesis",
    narrationSummary: "Light plus water plus carbon dioxide makes glucose plus oxygen.",
    narrationBlockCount: 1,
    durationSeconds: 16,
    status: ready,
  },
];

const sectionStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};

/** Brand, loading and storyboard pieces for the design preview harness. */
export function BrandPreview() {
  const [selected, setSelected] = useState<string | null>(
    PREVIEW_SCENES[2]?.sceneId ?? null,
  );
  const [scenes, setScenes] = useState(PREVIEW_SCENES);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
      <section style={sectionStyle}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>Logo</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "32px", flexWrap: "wrap" }}>
          <BrandLogo size={36} />
          <BrandLogo size={22} />
          <BrandMark size={48} title="PageMotion" />
          <BrandMark size={48} working title="PageMotion, working" />
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>Onion Skin loader</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "32px", flexWrap: "wrap" }}>
          <OnionSkinLoader size={96} label="Loading" />
          <OnionSkinLoader size={56} />
          <OnionSkinLoader size={32} />
          <OnionSkinLoader size={18} />
        </div>
        <div
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-card, 16px)",
          }}
        >
          <PageLoading message="Loading the storyboard…" />
        </div>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
          <LoadingImage
            src="/lesson-frames/photosynthesis-process.jpg"
            alt="Process scene from the photosynthesis sample lesson"
            frameStyle={{ width: 320, aspectRatio: "16 / 9", borderRadius: 10 }}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>Lesson reel</h2>
        <div style={{ width: "min(100%, 30rem)" }}>
          <LessonReel />
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>
          Storyboard timeline and scene list
        </h2>
        <div
          className="theme-focus-studio"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            padding: "24px",
            borderRadius: "var(--radius-card, 16px)",
            backgroundColor: "var(--color-canvas)",
            color: "var(--color-text)",
          }}
        >
          <SceneTimeline
            scenes={scenes}
            selectedSceneId={selected}
            onSelect={setSelected}
          />
          <div
            style={{
              width: "340px",
              height: "380px",
              overflow: "hidden",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-card, 16px)",
              backgroundColor: "var(--color-surface)",
            }}
          >
            <SceneList
              scenes={scenes}
              selectedSceneId={selected}
              stale={false}
              onSelect={setSelected}
              onReorder={(ids) =>
                setScenes((current) =>
                  ids
                    .map((id) => current.find((scene) => scene.sceneId === id))
                    .filter((scene): scene is StoryboardSceneListEntry => scene !== undefined)
                    .map((scene, index) => ({ ...scene, order: index + 1 })),
                )
              }
            />
          </div>
        </div>
      </section>
    </div>
  );
}
