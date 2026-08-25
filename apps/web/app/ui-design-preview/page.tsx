"use client";

import React, { useState } from "react";
import { Button } from "../../components/ui/button";
import { IconButton } from "../../components/ui/icon-button";
import { Field } from "../../components/ui/field";
import { SegmentedControl, Checkbox } from "../../components/ui/choices";
import { StatusLabel } from "../../components/ui/status-label";
import { Notice } from "../../components/ui/notice";
import { Skeleton } from "../../components/ui/skeleton";
import { Dialog } from "../../components/ui/dialog";
import { Drawer } from "../../components/ui/drawer";
import { Menu } from "../../components/ui/menu";
import { Tabs } from "../../components/ui/tabs";
import { PageContainer } from "../../components/layout/page-container";
import { AppHeader } from "../../components/layout/app-header";
import { ProjectPipelineRail } from "../../components/layout/project-pipeline-rail";
import { InformationRail } from "../../components/layout/information-rail";
import { EditorShell } from "../../components/layout/editor-shell";

import { Plus, Trash, Play, Gear, Sparkle } from "@phosphor-icons/react";

export default function UIDesignPreviewPage() {
  const [themeMode, setThemeMode] = useState<"studio-daylight" | "focus-studio">("studio-daylight");
  const [activeTab, setActiveTab] = useState("primitives");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [segmentedVal, setSegmentedVal] = useState("daylight");
  const [checkboxVal, setCheckboxVal] = useState(true);

  const handleActionClick = (message: string) => {
    if (typeof window !== "undefined") {
      window.alert(message);
    }
  };

  const pipelineStages = [
    { id: "Source" as const, label: "1. Source", status: "completed" as const },
    { id: "Review" as const, label: "2. Review", status: "completed" as const },
    { id: "Setup" as const, label: "3. Setup", status: "current" as const },
    { id: "Objectives" as const, label: "4. Objectives", status: "available" as const },
    { id: "Outline" as const, label: "5. Outline", status: "blocked" as const },
  ];

  return (
    <div className={themeMode === "focus-studio" ? "theme-focus-studio" : "theme-studio-daylight"}>
      <AppHeader
        projectTitle="Photosynthesis Explainer Lesson"
        projectStatus={<StatusLabel status="in_progress" label="Editing" size="compact" />}
        userEmail="teacher@school.edu"
        onSignOut={() => handleActionClick("Sign out clicked")}
        actions={
          <Button
            variant="secondary"
            size="compact"
            onClick={() =>
              setThemeMode((prev) => (prev === "studio-daylight" ? "focus-studio" : "studio-daylight"))
            }
          >
            Toggle Theme: {themeMode === "studio-daylight" ? "Studio Daylight" : "Focus Studio"}
          </Button>
        }
      />

      <PageContainer>
        <div style={{ marginBottom: "24px" }}>
          <h1 style={{ fontSize: "28px", fontWeight: 700, margin: "0 0 8px 0" }}>
            Product UI Design System Preview & Harness
          </h1>
          <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
            Deterministic component preview for Studio Daylight and Focus Studio modes.
          </p>
        </div>

        <Tabs
          tabs={[
            { id: "primitives", label: "UI Primitives" },
            { id: "states", label: "Interaction & Status States" },
            { id: "layouts", label: "Layout Primitives" },
            { id: "editor-preview", label: "Editor Shell Preview" },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />

        <div style={{ marginTop: "24px" }}>
          {activeTab === "primitives" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
              {/* Buttons Section */}
              <section style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>Buttons & Icon Buttons</h2>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
                  <Button variant="primary" leftIcon={<Plus />}>Primary Action</Button>
                  <Button variant="secondary">Secondary Action</Button>
                  <Button variant="tertiary">Tertiary Action</Button>
                  <Button variant="destructive" leftIcon={<Trash />}>Delete Project</Button>
                  <Button variant="primary" isLoading>Processing</Button>
                  <Button variant="primary" disabled>Disabled Action</Button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <IconButton aria-label="Play preview" icon={<Play weight="fill" />} variant="primary" />
                  <IconButton aria-label="Settings" icon={<Gear />} variant="secondary" />
                  <IconButton aria-label="AI Assist" icon={<Sparkle />} variant="tertiary" />
                  <IconButton aria-label="Delete item" icon={<Trash />} variant="destructive" />
                </div>
              </section>

              {/* Form Fields & Choices Section */}
              <section style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>Form Fields & Controls</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
                  <Field id="lesson-title" label="Lesson Title" helperText="Enter a descriptive title for students.">
                    <input
                      id="lesson-title"
                      type="text"
                      defaultValue="Photosynthesis & Cell Respiration"
                      style={{
                        padding: "8px 12px",
                        borderRadius: "var(--radius-control)",
                        border: "1px solid var(--color-border)",
                        backgroundColor: "var(--color-surface-raised)",
                        color: "var(--color-text)",
                        fontSize: "14px",
                      }}
                    />
                  </Field>

                  <Field id="target-age" label="Target Age Group" error="Age group is required for vocabulary selection.">
                    <input
                      id="target-age"
                      type="text"
                      placeholder="e.g. 10-14"
                      style={{
                        padding: "8px 12px",
                        borderRadius: "var(--radius-control)",
                        border: "1px solid var(--color-error-border)",
                        backgroundColor: "var(--color-error-bg)",
                        color: "var(--color-text)",
                        fontSize: "14px",
                      }}
                    />
                  </Field>

                  <Field isFieldset legend="Theme Mode Selection">
                    <SegmentedControl
                      name="theme"
                      value={segmentedVal}
                      onChange={setSegmentedVal}
                      options={[
                        { value: "daylight", label: "Studio Daylight" },
                        { value: "focus", label: "Focus Studio" },
                      ]}
                    />
                  </Field>

                  <Field isFieldset legend="Narration Options">
                    <Checkbox
                      id="captions-check"
                      label="Generate Synchronized Captions"
                      description="Automatically generate captions matching voice timing."
                      checked={checkboxVal}
                      onChange={(e) => setCheckboxVal(e.target.checked)}
                    />
                  </Field>
                </div>
              </section>

              {/* Menus & Dialog Triggers */}
              <section style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>Overlays & Menus</h2>
                <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                  <Button variant="secondary" onClick={() => setIsDialogOpen(true)}>Open Modal Dialog</Button>
                  <Button variant="secondary" onClick={() => setIsDrawerOpen(true)}>Open Slide Drawer</Button>
                  <Menu
                    items={[
                      { label: "Duplicate Project", onClick: () => handleActionClick("Duplicate") },
                      { label: "Delete Project", onClick: () => handleActionClick("Delete"), destructive: true },
                    ]}
                  />
                </div>
              </section>
            </div>
          )}

          {activeTab === "states" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 600, margin: 0 }}>Status Badges & Notices</h2>

              <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
                <StatusLabel status="success" label="Ingestion Complete" />
                <StatusLabel status="warning" label="Unsaved Changes" />
                <StatusLabel status="error" label="Render Failed" />
                <StatusLabel status="info" label="Draft Mode" />
                <StatusLabel status="in_progress" label="Generating Voice..." />
                <StatusLabel status="blocked" label="Outline Required" />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "600px" }}>
                <Notice type="success" title="Source Ingested" message="Your PDF document was parsed into 12 verified sections." />
                <Notice type="warning" title="Citation Warning" message="Scene 4 includes unverified claims. Please review source grounding." />
                <Notice
                  type="error"
                  title="Audio Generation Error"
                  message="Failed to generate TTS audio block. Check network connection."
                  actionLabel="Retry Generation"
                  onAction={() => handleActionClick("Retrying...")}
                />
                <Notice type="info" title="Autosaved" message="Draft updated 2 minutes ago." />
              </div>

              <h2 style={{ fontSize: "18px", fontWeight: 600, margin: "16px 0 0 0" }}>Loading Skeletons</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "400px" }}>
                <Skeleton height="32px" width="60%" />
                <Skeleton height="20px" width="100%" />
                <Skeleton height="20px" width="80%" />
              </div>
            </div>
          )}

          {activeTab === "layouts" && (
            <div style={{ display: "flex", gap: "24px", minHeight: "400px" }}>
              <ProjectPipelineRail stages={pipelineStages} />
              <div style={{ flex: 1, padding: "20px", backgroundColor: "var(--color-surface)", borderRadius: "var(--radius-card)", border: "1px solid var(--color-border)" }}>
                <h3 style={{ margin: "0 0 12px 0" }}>Main Content Workspace Area</h3>
                <p style={{ color: "var(--color-text-muted)" }}>
                  This layout container demonstrates the 224px project pipeline rail alongside the flexible central working surface and contextual information rail.
                </p>
              </div>
              <InformationRail title="Stage Requirements">
                <Notice type="info" message="Setup requires selecting an audience age group and lesson duration." />
                <Button variant="primary" style={{ width: "100%" }}>Save Setup</Button>
              </InformationRail>
            </div>
          )}

          {activeTab === "editor-preview" && (
            <div style={{ height: "500px", border: "1px solid var(--color-border)", borderRadius: "var(--radius-card)", overflow: "hidden" }}>
              <EditorShell
                leftNav={
                  <div style={{ padding: "16px" }}>
                    <h4 style={{ margin: "0 0 12px 0", fontSize: "14px" }}>Scene List</h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ padding: "8px 12px", backgroundColor: "var(--color-surface-brand)", border: "1px solid var(--color-brand)", borderRadius: "var(--radius-control)" }}>
                        1. Introduction Scene
                      </div>
                      <div style={{ padding: "8px 12px", backgroundColor: "var(--color-surface-subtle)", borderRadius: "var(--radius-control)" }}>
                        2. Chemical Formula
                      </div>
                    </div>
                  </div>
                }
                centerCanvas={
                  <div style={{ width: "80%", aspectRatio: "16/9", backgroundColor: "#000", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
                    16:9 Lesson Preview Player Canvas
                  </div>
                }
                rightInspector={
                  <div style={{ padding: "16px" }}>
                    <h4 style={{ margin: "0 0 12px 0", fontSize: "14px" }}>Scene Inspector</h4>
                    <Field label="Duration (sec)">
                      <input type="number" defaultValue={15} style={{ padding: "6px", width: "100%" }} />
                    </Field>
                  </div>
                }
              />
            </div>
          )}
        </div>
      </PageContainer>

      {/* Dialog Overlay */}
      <Dialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        title="Confirm Lesson Render"
        description="Rendering will consume 3 production render credits."
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setIsDialogOpen(false)}>Start Render</Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: "14px" }}>
          Once rendering begins, scene narration and visual elements cannot be edited until the video is complete.
        </p>
      </Dialog>

      {/* Drawer Overlay */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="Project Metadata & Grounding"
      >
        <p style={{ margin: 0, fontSize: "14px" }}>
          Uploaded document: <strong>biology_ch4_photosynthesis.pdf</strong> (14 pages).
        </p>
      </Drawer>
    </div>
  );
}
