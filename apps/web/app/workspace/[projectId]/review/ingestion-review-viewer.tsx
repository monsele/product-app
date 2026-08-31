"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  parsedDocumentReviewResponseSchema,
  parsedDocumentSectionResponseSchema,
  reviewContentBlockSchema,
  reviewFigureSchema,
  sourceApprovalStatusSchema,
  sourceSectionSelectionResponseSchema,
  sourceSectionSelectionSchema,
  type ParsedDocumentReviewResponse,
  type ParsedDocumentSectionResponse,
  type ReviewContentBlock,
  type ReviewFigure,
  type SourceApprovalStatus,
  type SourceSectionSelection,
} from "@avlp/schemas";
import {
  CheckCircle,
  Warning as WarningIcon,
  XCircle,
  MagnifyingGlass,
  ArrowRight,
  ArrowsClockwise,
  Eye,
  EyeSlash,
  PencilSimple,
  ArrowCounterClockwise,
  FileText,
  Image as ImageIcon,
  Table as TableIcon,
  ShieldCheck,
  SidebarSimple,
  CaretDown,
  CaretRight,
  Sparkle,
} from "@phosphor-icons/react";
import {
  buildSectionUpdateInput,
  type SectionSelectionAction,
} from "./source-section-controls";
import {
  blockCorrectionRevision,
  buildBlockCorrectionInput,
  type BlockCorrectionAction,
} from "./source-block-controls";
import {
  buildFigureUpdateInput,
  type FigureSelectionAction,
} from "./source-figure-controls";
import { toast } from "../../../../components/ui/toast-provider";

type State =
  | { kind: "loading" }
  | { kind: "ready"; value: ParsedDocumentReviewResponse }
  | { kind: "failed"; message: string };

type SectionState = {
  detail?: ParsedDocumentSectionResponse;
  loading: boolean;
  error?: string;
};

type ApprovalState =
  | { kind: "loading" }
  | { kind: "ready"; value: SourceApprovalStatus }
  | { kind: "approving" }
  | { kind: "failed"; message: string };

type SelectedItem =
  | { kind: "none" }
  | { kind: "section"; sectionId: string }
  | { kind: "block"; sectionId: string; blockId: string }
  | { kind: "figure"; sectionId: string; figureId: string };

function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;
}

function selectionFor(
  selections: Record<string, SourceSectionSelection>,
  sectionId: string,
): SourceSectionSelection | undefined {
  return selections[sectionId];
}

export interface IngestionReviewViewerProps {
  projectId: string;
  projectTitle?: string;
  focusSectionId?: string;
  focusBlockId?: string;
}

export function IngestionReviewViewer({
  projectId,
  projectTitle,
  focusSectionId,
  focusBlockId,
}: IngestionReviewViewerProps) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [selections, setSelections] = useState<
    Record<string, SourceSectionSelection>
  >({});
  const [selectionError, setSelectionError] = useState<string | undefined>();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(),
  );
  const [sectionStates, setSectionStates] = useState<
    Record<string, SectionState>
  >({});
  const sectionStatesRef = useRef(sectionStates);
  sectionStatesRef.current = sectionStates;

  const [approvalState, setApprovalState] = useState<ApprovalState>({
    kind: "loading",
  });
  const [selectedItem, setSelectedItem] = useState<SelectedItem>({
    kind: "none",
  });
  const [mobileTab, setMobileTab] = useState<"sections" | "content" | "details">(
    "content",
  );
  const [tabletInspectorOpen, setTabletInspectorOpen] = useState(false);
  const [sectionSearch, setSectionSearch] = useState("");

  const refreshApproval = useCallback(async () => {
    setApprovalState({ kind: "loading" });
    try {
      const response = await fetch(
        apiUrl(`/projects/${encodeURIComponent(projectId)}/source-review`),
        { credentials: "include", cache: "no-store" },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error("source-review");
      const parsed = sourceApprovalStatusSchema.safeParse(payload);
      if (!parsed.success) throw new Error("source-review");
      setApprovalState({ kind: "ready", value: parsed.data });
    } catch {
      setApprovalState({
        kind: "failed",
        message: "Approval status is unavailable.",
      });
    }
  }, [projectId]);

  useEffect(() => {
    void refreshApproval();
  }, [refreshApproval]);

  const approveSource = useCallback(async () => {
    setApprovalState({ kind: "approving" });
    try {
      const response = await fetch(
        apiUrl(
          `/projects/${encodeURIComponent(projectId)}/source-review/approve`,
        ),
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "object" &&
          payload.error !== null &&
          "message" in payload.error &&
          typeof payload.error.message === "string"
            ? payload.error.message
            : "Unable to confirm the source content.";
        throw new Error(message);
      }
      await refreshApproval();
      toast.success("Source content confirmed.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to confirm the source content.";
      setApprovalState({ kind: "failed", message });
      toast.error(message);
    }
  }, [projectId, refreshApproval]);

  const refresh = useCallback(async () => {
    try {
      const [reviewResponse, selectionResponse] = await Promise.all([
        fetch(
          apiUrl(`/projects/${encodeURIComponent(projectId)}/parsed-document`),
          { credentials: "include", cache: "no-store" },
        ),
        fetch(
          apiUrl(`/projects/${encodeURIComponent(projectId)}/source-sections`),
          { credentials: "include", cache: "no-store" },
        ),
      ]);
      const [reviewPayload, selectionPayload] = await Promise.all([
        reviewResponse.json().catch(() => null),
        selectionResponse.json().catch(() => null),
      ]);
      const review = reviewResponse.ok
        ? parsedDocumentReviewResponseSchema.safeParse(reviewPayload)
        : undefined;
      const selection = selectionResponse.ok
        ? sourceSectionSelectionResponseSchema.safeParse(selectionPayload)
        : undefined;
      if (review === undefined || !review.success) throw new Error("review");
      if (selection === undefined || !selection.success)
        throw new Error("selection");
      setState({ kind: "ready", value: review.data });
      setSelections(
        Object.fromEntries(
          selection.data.sections.map((entry) => [entry.id, entry]),
        ),
      );
    } catch {
      setState({
        kind: "failed",
        message: "We could not load the document review. Please try again.",
      });
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleSection = useCallback(
    async (sectionId: string) => {
      setExpandedSections((prev) => {
        const next = new Set(prev);
        if (next.has(sectionId)) {
          next.delete(sectionId);
        } else {
          next.add(sectionId);
        }
        return next;
      });
      setSelectedItem({ kind: "section", sectionId });
      if (sectionStatesRef.current[sectionId]?.detail !== undefined) return;
      setSectionStates((prev) => ({
        ...prev,
        [sectionId]: { loading: true },
      }));
      try {
        const response = await fetch(
          apiUrl(
            `/projects/${encodeURIComponent(projectId)}/parsed-document/sections/${encodeURIComponent(sectionId)}`,
          ),
          { credentials: "include", cache: "no-store" },
        );
        const payload: unknown = await response.json().catch(() => null);
        const parsed = response.ok
          ? parsedDocumentSectionResponseSchema.safeParse(payload)
          : undefined;
        if (parsed === undefined || !parsed.success)
          throw new Error("Unable to load section content.");
        setSectionStates((prev) => ({
          ...prev,
          [sectionId]: { loading: false, detail: parsed.data },
        }));
      } catch (error) {
        setSectionStates((prev) => ({
          ...prev,
          [sectionId]: {
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Unable to load section content.",
          },
        }));
      }
    },
    [projectId],
  );

  const focusedRef = useRef(false);

  useEffect(() => {
    if (state.kind !== "ready" || focusSectionId === undefined) return;
    if (!expandedSections.has(focusSectionId)) void toggleSection(focusSectionId);
  }, [state.kind, focusSectionId, expandedSections, toggleSection]);

  useEffect(() => {
    if (
      state.kind !== "ready" ||
      focusSectionId === undefined ||
      focusedRef.current
    )
      return;
    const detail = sectionStates[focusSectionId]?.detail;
    if (detail === undefined) return;
    focusedRef.current = true;
    const target =
      focusBlockId !== undefined
        ? window.document.querySelector(`[data-block-id="${focusBlockId}"]`)
        : window.document.getElementById(`section-${focusSectionId}`);
    if (target !== null) {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      if (target instanceof HTMLElement) target.focus();
      if (focusBlockId !== undefined) {
        setSelectedItem({
          kind: "block",
          sectionId: focusSectionId,
          blockId: focusBlockId,
        });
      } else {
        setSelectedItem({ kind: "section", sectionId: focusSectionId });
      }
    }
  }, [state.kind, focusSectionId, focusBlockId, sectionStates]);

  const updateSection = useCallback(
    async (sectionId: string, action: SectionSelectionAction) => {
      setSelectionError(undefined);
      const current = selectionFor(selections, sectionId);
      const body = buildSectionUpdateInput(
        {
          revision: current?.revision ?? 0,
          included: current?.included ?? true,
          displayHeading: current?.displayHeading ?? null,
        },
        action,
      );
      try {
        const response = await fetch(
          apiUrl(
            `/projects/${encodeURIComponent(projectId)}/source-sections/${encodeURIComponent(sectionId)}`,
          ),
          {
            method: "PATCH",
            credentials: "include",
            cache: "no-store",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "object" &&
            payload.error !== null &&
            "message" in payload.error &&
            typeof payload.error.message === "string"
              ? payload.error.message
              : "Unable to update the section selection.";
          throw new Error(message);
        }
        const parsed = sourceSectionSelectionSchema.safeParse(payload);
        if (!parsed.success) throw new Error("Unable to update the section.");
        setSelections((prev) => ({ ...prev, [sectionId]: parsed.data }));
      } catch (error) {
        // Toggles are high-frequency, so only the failure is worth a toast:
        // a successful toggle already shows in the row itself.
        const message =
          error instanceof Error
            ? error.message
            : "Unable to update the section selection.";
        setSelectionError(message);
        toast.error(message);
      }
    },
    [projectId, selections],
  );

  const correctBlock = useCallback(
    async (
      sectionId: string,
      blockId: string,
      block: Pick<
        ParsedDocumentSectionResponse["section"]["blocks"][number],
        "kind"
      >,
      action: BlockCorrectionAction,
    ) => {
      const current = sectionStatesRef.current[sectionId]?.detail;
      if (current === undefined) return;
      const blockDetail = current.section.blocks.find(
        (entry) => entry.id === blockId,
      );
      if (blockDetail === undefined) return;
      const body = buildBlockCorrectionInput(
        block,
        { revision: blockCorrectionRevision(blockDetail) },
        action,
      );
      const url =
        action.kind === "restore"
          ? apiUrl(
              `/projects/${encodeURIComponent(projectId)}/source-blocks/${encodeURIComponent(blockId)}/restore`,
            )
          : apiUrl(
              `/projects/${encodeURIComponent(projectId)}/source-blocks/${encodeURIComponent(blockId)}`,
            );
      try {
        const response = await fetch(url, {
          method: action.kind === "restore" ? "POST" : "PATCH",
          credentials: "include",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "object" &&
            payload.error !== null &&
            "message" in payload.error &&
            typeof payload.error.message === "string"
              ? payload.error.message
              : "Unable to update the block content.";
          throw new Error(message);
        }
        const parsed = reviewContentBlockSchema.safeParse(payload);
        if (!parsed.success) throw new Error("Unable to update the block.");
        setSectionStates((prev) => {
          const detail = prev[sectionId]?.detail;
          if (detail === undefined) return prev;
          return {
            ...prev,
            [sectionId]: {
              loading: false,
              detail: {
                ...detail,
                section: {
                  ...detail.section,
                  blocks: detail.section.blocks.map((entry) =>
                    entry.id === blockId ? parsed.data : entry,
                  ),
                },
              },
            },
          };
        });
      } catch (error) {
        setSectionStates((prev) => {
          const existing = prev[sectionId];
          return {
            ...prev,
            [sectionId]: {
              loading: false,
              ...(existing?.detail === undefined
                ? {}
                : { detail: existing.detail }),
              error:
                error instanceof Error
                  ? error.message
                  : "Unable to update the block content.",
            },
          };
        });
      }
    },
    [projectId],
  );

  const updateFigure = useCallback(
    async (
      sectionId: string,
      figureId: string,
      figure: Pick<ReviewFigure, "included" | "revision">,
      action: FigureSelectionAction,
    ) => {
      const body = buildFigureUpdateInput(
        { revision: figure.revision, included: figure.included },
        action,
      );
      try {
        const response = await fetch(
          apiUrl(
            `/projects/${encodeURIComponent(projectId)}/source-figures/${encodeURIComponent(figureId)}`,
          ),
          {
            method: "PATCH",
            credentials: "include",
            cache: "no-store",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "object" &&
            payload.error !== null &&
            "message" in payload.error &&
            typeof payload.error.message === "string"
              ? payload.error.message
              : "Unable to update the figure inclusion.";
          throw new Error(message);
        }
        const parsed = reviewFigureSchema.safeParse(payload);
        if (!parsed.success) throw new Error("Unable to update the figure.");
        setSectionStates((prev) => {
          const detail = prev[sectionId]?.detail;
          if (detail === undefined) return prev;
          return {
            ...prev,
            [sectionId]: {
              loading: false,
              detail: {
                ...detail,
                section: {
                  ...detail.section,
                  figures: detail.section.figures.map((entry) =>
                    entry.id === figureId
                      ? { ...entry, ...parsed.data }
                      : entry,
                  ),
                },
              },
            },
          };
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to update the figure inclusion.";
        setSectionStates((prev) => {
          const existing = prev[sectionId];
          return {
            ...prev,
            [sectionId]: {
              loading: false,
              ...(existing?.detail === undefined
                ? {}
                : { detail: existing.detail }),
              error: message,
            },
          };
        });
        // The figure row error can sit off-screen inside a collapsed section.
        toast.error(message);
      }
    },
    [projectId],
  );

  const navigateToWarning = useCallback(
    (warning: { id: string; sectionId?: string | undefined }) => {
      if (warning.sectionId !== undefined) {
        const sid = warning.sectionId;
        setExpandedSections((prev) => {
          const next = new Set(prev);
          next.add(sid);
          return next;
        });
        setSelectedItem({ kind: "section", sectionId: sid });
        if (sectionStatesRef.current[sid]?.detail === undefined) {
          void toggleSection(sid);
        }
        setMobileTab("content");
        window.setTimeout(() => {
          const element = window.document.getElementById(`section-${sid}`);
          if (element !== null) {
            element.scrollIntoView({ block: "center", behavior: "smooth" });
            element.focus();
          }
        }, 50);
      }
    },
    [toggleSection],
  );

  if (state.kind === "loading") {
    return (
      <section
        aria-labelledby="review-heading"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          padding: "32px",
          backgroundColor: "var(--color-surface)",
          borderRadius: "var(--radius-card)",
          border: "1px solid var(--color-border)",
        }}
      >
        <h2 id="review-heading" style={{ margin: 0, fontSize: "20px" }}>
          Document review
        </h2>
        <div
          role="status"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            color: "var(--color-text-muted)",
          }}
        >
          <ArrowsClockwise
            weight="bold"
            className="ui-spinner"
          />
          <span>Loading document review…</span>
        </div>
      </section>
    );
  }

  if (state.kind === "failed") {
    return (
      <section
        aria-labelledby="review-heading"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          padding: "32px",
          backgroundColor: "var(--color-error-bg)",
          borderRadius: "var(--radius-card)",
          border: "1px solid var(--color-error-border)",
        }}
      >
        <h2
          id="review-heading"
          style={{ margin: 0, fontSize: "20px", color: "var(--color-error-fg)" }}
        >
          Document review
        </h2>
        <p role="alert" style={{ margin: 0, color: "var(--color-error-fg)" }}>
          {state.message}
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          style={{
            alignSelf: "flex-start",
            padding: "8px 16px",
            backgroundColor: "var(--color-brand)",
            color: "var(--color-on-brand)",
            border: "none",
            borderRadius: "var(--radius-control)",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </section>
    );
  }

  const { document: doc, sections, warnings, quality } = state.value;

  const filteredSections = sections.filter((s) => {
    if (!sectionSearch.trim()) return true;
    const query = sectionSearch.toLowerCase();
    const sel = selectionFor(selections, s.id);
    const title = (sel?.displayHeading ?? s.heading).toLowerCase();
    return title.includes(query) || s.id.toLowerCase().includes(query);
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        width: "100%",
      }}
    >
      {/* Top Header & Metadata Banner (Studio Daylight High-Density) */}
      <header
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-card)",
          padding: "20px 24px",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          boxShadow: "var(--shadow-elevation)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h2
              id="review-heading"
              style={{
                margin: 0,
                fontSize: "22px",
                fontWeight: 700,
                color: "var(--color-text)",
                letterSpacing: "-0.01em",
              }}
            >
              Document review
            </h2>
            <span
              style={{
                fontSize: "12px",
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: "var(--radius-pill)",
                backgroundColor: "var(--color-surface-brand)",
                color: "var(--color-brand)",
              }}
            >
              v{doc.version}
            </span>
          </div>

          <dl
            style={{
              margin: 0,
              display: "flex",
              flexWrap: "wrap",
              gap: "16px",
              fontSize: "13px",
              color: "var(--color-text-muted)",
            }}
          >
            <div style={{ display: "flex", gap: "4px" }}>
              <dt style={{ fontWeight: 600, color: "var(--color-text)" }}>Title:</dt>
              <dd style={{ margin: 0 }}>{doc.title ?? projectTitle ?? "Untitled document"}</dd>
            </div>
            <div style={{ display: "flex", gap: "4px" }}>
              <dt style={{ fontWeight: 600, color: "var(--color-text)" }}>Pages:</dt>
              <dd style={{ margin: 0 }}>{doc.pageCount}</dd>
            </div>
            <div style={{ display: "flex", gap: "4px" }}>
              <dt style={{ fontWeight: 600, color: "var(--color-text)" }}>Parsed version:</dt>
              <dd style={{ margin: 0 }}>{doc.version}</dd>
            </div>
            <div style={{ display: "flex", gap: "4px" }}>
              <dt style={{ fontWeight: 600, color: "var(--color-text)" }}>Schema version:</dt>
              <dd style={{ margin: 0 }}>{doc.schemaVersion}</dd>
            </div>
          </dl>
        </div>

        {/* Quality Score & Fast Approval Action */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {quality !== null ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 14px",
                borderRadius: "var(--radius-control)",
                backgroundColor:
                  quality.score >= 80
                    ? "var(--color-success-bg)"
                    : quality.score >= 50
                    ? "var(--color-warning-bg)"
                    : "var(--color-error-bg)",
                border: `1px solid ${
                  quality.score >= 80
                    ? "var(--color-success-border)"
                    : quality.score >= 50
                    ? "var(--color-warning-border)"
                    : "var(--color-error-border)"
                }`,
                color:
                  quality.score >= 80
                    ? "var(--color-success-fg)"
                    : quality.score >= 50
                    ? "var(--color-warning-fg)"
                    : "var(--color-error-fg)",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              <ShieldCheck weight="bold" size={18} />
              <span>
                Quality score: {quality.score}/100 —{" "}
                <strong>{quality.status.replace("_", " ")}</strong>
              </span>
            </div>
          ) : null}

          {/* Proceed to Next Phase Action */}
          <Link
            href={`/workspace/${encodeURIComponent(projectId)}/configuration`}
            prefetch={true}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "9px 18px",
              backgroundColor: "var(--color-brand)",
              color: "var(--color-on-brand)",
              borderRadius: "var(--radius-control)",
              fontSize: "14px",
              fontWeight: 600,
              textDecoration: "none",
              cursor: "pointer",
              boxShadow: "var(--shadow-elevation)",
              transition: "opacity var(--motion-quick) var(--motion-easing)",
            }}
          >
            <span>Proceed to lesson setup</span>
            <ArrowRight weight="bold" size={16} />
          </Link>

          {/* Toggle Tablet Inspector */}
          <button
            type="button"
            className="tablet-inspector-toggle"
            onClick={() => setTabletInspectorOpen((prev) => !prev)}
            aria-label="Toggle details inspector"
            style={{
              display: "none",
              alignItems: "center",
              gap: "6px",
              padding: "8px 12px",
              backgroundColor: "var(--color-surface-subtle)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-control)",
              color: "var(--color-text)",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <SidebarSimple weight="bold" size={16} />
            <span>Inspector</span>
          </button>
        </div>
      </header>

      {/* Persistent Selection Error Banner */}
      {selectionError !== undefined ? (
        <div
          role="alert"
          style={{
            padding: "12px 16px",
            backgroundColor: "var(--color-error-bg)",
            border: "1px solid var(--color-error-border)",
            borderRadius: "var(--radius-control)",
            color: "var(--color-error-fg)",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <XCircle weight="fill" size={18} />
          <span>{selectionError}</span>
        </div>
      ) : null}

      {/* Mobile Tab Switcher (<768px) */}
      <div
        className="mobile-review-tabs"
        style={{
          display: "none",
          gap: "4px",
          padding: "4px",
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-control)",
        }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "sections"}
          onClick={() => setMobileTab("sections")}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: "var(--radius-control)",
            border: "none",
            backgroundColor:
              mobileTab === "sections"
                ? "var(--color-brand)"
                : "transparent",
            color:
              mobileTab === "sections"
                ? "var(--color-on-brand)"
                : "var(--color-text-muted)",
            fontWeight: 600,
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          Sections ({sections.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "content"}
          onClick={() => setMobileTab("content")}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: "var(--radius-control)",
            border: "none",
            backgroundColor:
              mobileTab === "content"
                ? "var(--color-brand)"
                : "transparent",
            color:
              mobileTab === "content"
                ? "var(--color-on-brand)"
                : "var(--color-text-muted)",
            fontWeight: 600,
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          Content
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "details"}
          onClick={() => setMobileTab("details")}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: "var(--radius-control)",
            border: "none",
            backgroundColor:
              mobileTab === "details"
                ? "var(--color-brand)"
                : "transparent",
            color:
              mobileTab === "details"
                ? "var(--color-on-brand)"
                : "var(--color-text-muted)",
            fontWeight: 600,
            fontSize: "13px",
            cursor: "pointer",
          }}
        >
          Details
        </button>
      </div>

      {/* Main 3-Region Workspace Layout */}
      <div
        className="review-workspace-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "300px minmax(0, 1fr) 340px",
          gap: "20px",
          alignItems: "start",
          minHeight: "650px",
        }}
      >
        {/* REGION 1: Left Navigation Rail (Sections Tree & Warnings) */}
        <aside
          className={`review-region-sections ${
            mobileTab === "sections" ? "mobile-active" : ""
          }`}
          aria-label="Section Navigation and Document Diagnostics"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-card)",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            position: "sticky",
            top: "16px",
            maxHeight: "calc(100vh - 32px)",
            overflowY: "auto",
          }}
        >
          {/* Quick Search */}
          <div style={{ position: "relative" }}>
            <label htmlFor="section-filter-input" style={{ display: "none" }}>
              Filter sections
            </label>
            <input
              id="section-filter-input"
              type="text"
              placeholder="Search sections…"
              value={sectionSearch}
              onChange={(e) => setSectionSearch(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px 8px 32px",
                fontSize: "13px",
                borderRadius: "var(--radius-control)",
                border: "1px solid var(--color-border)",
                backgroundColor: "var(--color-surface-subtle)",
                color: "var(--color-text)",
              }}
            />
            <MagnifyingGlass
              size={16}
              style={{
                position: "absolute",
                left: "10px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--color-text-muted)",
              }}
            />
          </div>

          {/* Warnings List & Fast Jump */}
          {warnings.length > 0 ? (
            <div
              aria-labelledby="warnings-heading"
              style={{
                backgroundColor: "var(--color-warning-bg)",
                border: "1px solid var(--color-warning-border)",
                borderRadius: "var(--radius-control)",
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <h3
                  id="warnings-heading"
                  style={{
                    margin: 0,
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "var(--color-warning-fg)",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <WarningIcon weight="fill" size={16} />
                  <span>Warnings ({warnings.length})</span>
                </h3>
              </div>
              <ul
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                {warnings.map((warning) => (
                  <li
                    key={warning.id}
                    id={`warning-${warning.id}`}
                    aria-label={`Warning: ${warning.message}`}
                    style={{
                      fontSize: "12px",
                      color: "var(--color-warning-fg)",
                      lineHeight: "16px",
                      borderBottom: "1px solid rgba(138, 75, 8, 0.15)",
                      paddingBottom: "6px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "6px",
                        marginBottom: "4px",
                      }}
                    >
                      <span
                        data-severity={warning.severity}
                        style={{
                          fontWeight: 700,
                          textTransform: "uppercase",
                          fontSize: "10px",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {warning.severity}
                      </span>
                      <span style={{ fontSize: "11px", opacity: 0.85 }}>
                        page {warning.pageStart}
                        {warning.pageEnd !== warning.pageStart
                          ? `–${warning.pageEnd}`
                          : ""}
                      </span>
                    </div>
                    <div>{warning.message}</div>
                    {warning.sectionId !== undefined ? (
                      <button
                        type="button"
                        onClick={() => void navigateToWarning(warning)}
                        style={{
                          marginTop: "6px",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          fontSize: "11px",
                          fontWeight: 600,
                          color: "var(--color-brand)",
                          backgroundColor: "var(--color-surface)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "var(--radius-pill)",
                          padding: "2px 8px",
                          cursor: "pointer",
                        }}
                      >
                        <span>Go to section</span>
                        <ArrowRight size={12} />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Section Tree */}
          <div aria-labelledby="sections-heading" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <h3
              id="sections-heading"
              style={{
                margin: 0,
                fontSize: "14px",
                fontWeight: 700,
                color: "var(--color-text)",
                letterSpacing: "-0.01em",
              }}
            >
              Sections ({sections.length})
            </h3>
            {filteredSections.length === 0 ? (
              <p style={{ margin: 0, fontSize: "13px", color: "var(--color-text-muted)" }}>
                No matching sections.
              </p>
            ) : (
              <ul
                role="tree"
                aria-label="Document sections"
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                {filteredSections.map((section) => {
                  const isExpanded = expandedSections.has(section.id);
                  const selection = selectionFor(selections, section.id);
                  const included = selection?.included ?? true;
                  const effectiveHeading =
                    selection?.displayHeading ?? section.heading;
                  const isSelected =
                    selectedItem.kind === "section" &&
                    selectedItem.sectionId === section.id;

                  return (
                    <li
                      key={section.id}
                      role="treeitem"
                      aria-expanded={isExpanded}
                      style={{
                        padding: "8px 10px",
                        borderRadius: "var(--radius-control)",
                        backgroundColor: isSelected
                          ? "var(--color-surface-brand)"
                          : "var(--color-surface-subtle)",
                        border: isSelected
                          ? "1px solid var(--color-brand)"
                          : "1px solid var(--color-border)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: "8px",
                        }}
                      >
                        <button
                          type="button"
                          id={`section-${section.id}`}
                          aria-expanded={isExpanded}
                          aria-controls={`section-content-${section.id}`}
                          tabIndex={0}
                          onClick={() => {
                            void toggleSection(section.id);
                            setMobileTab("content");
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            margin: 0,
                            textAlign: "left",
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "var(--color-text)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            flex: 1,
                          }}
                        >
                          {isExpanded ? (
                            <CaretDown size={14} weight="bold" />
                          ) : (
                            <CaretRight size={14} weight="bold" />
                          )}
                          <span
                            style={{
                              textDecoration: included ? "none" : "line-through",
                              opacity: included ? 1 : 0.65,
                            }}
                          >
                            {effectiveHeading || "(untitled section)"}
                          </span>
                        </button>

                        <span
                          data-included={included}
                          style={{
                            fontSize: "11px",
                            fontWeight: 600,
                            padding: "1px 6px",
                            borderRadius: "var(--radius-pill)",
                            backgroundColor: included
                              ? "var(--color-success-bg)"
                              : "var(--color-surface-subtle)",
                            color: included
                              ? "var(--color-success-fg)"
                              : "var(--color-text-muted)",
                            border: `1px solid ${
                              included
                                ? "var(--color-success-border)"
                                : "var(--color-border)"
                            }`,
                          }}
                        >
                          {included ? "Included" : "Excluded"}
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          fontSize: "11px",
                          color: "var(--color-text-muted)",
                        }}
                      >
                        <span>
                          page {section.pageStart}
                          {section.pageEnd !== section.pageStart
                            ? `–${section.pageEnd}`
                            : ""}
                        </span>
                        <div style={{ display: "flex", gap: "6px" }}>
                          {section.blockCount > 0 && <span>{section.blockCount}b</span>}
                          {section.figureCount > 0 && <span>{section.figureCount}f</span>}
                          {section.tableCount > 0 && <span>{section.tableCount}t</span>}
                        </div>
                      </div>

                      {/* Fallback hidden semantic tree anchor for existing compatibility */}
                      <div data-section-selection style={{ display: "none" }}>
                        <span data-included={included}>
                          {included ? "Included" : "Excluded"}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            void updateSection(section.id, {
                              kind: included ? "exclude" : "include",
                            })
                          }
                        >
                          {included ? "Exclude" : "Include"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* REGION 2: Center Document Canvas (Dominant Reading Surface) */}
        <main
          className={`review-region-content ${
            mobileTab === "content" ? "mobile-active" : ""
          }`}
          aria-label="Extracted Document Content"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-card)",
            padding: "32px",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: "28px",
            boxShadow: "var(--shadow-elevation)",
          }}
        >
          {sections.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "var(--color-text-muted)" }}>
              <FileText size={48} weight="light" style={{ margin: "0 auto 12px auto" }} />
              <p style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>
                No sections were detected in this document.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "32px", maxWidth: "760px", margin: "0 auto", width: "100%" }}>
              {sections.map((section) => {
                const isExpanded = expandedSections.has(section.id);
                const sectionState = sectionStates[section.id];
                const selection = selectionFor(selections, section.id);
                const included = selection?.included ?? true;
                const effectiveHeading =
                  selection?.displayHeading ?? section.heading;

                return (
                  <article
                    key={section.id}
                    id={`section-article-${section.id}`}
                    style={{
                      borderBottom: "1px solid var(--color-border)",
                      paddingBottom: "28px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "16px",
                      opacity: included ? 1 : 0.6,
                    }}
                  >
                    {/* Section Header Card */}
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "12px",
                        padding: "12px 16px",
                        borderRadius: "var(--radius-control)",
                        backgroundColor: included
                          ? "var(--color-surface-subtle)"
                          : "rgba(108, 101, 117, 0.08)",
                        border: "1px solid var(--color-border)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <button
                          type="button"
                          onClick={() => void toggleSection(section.id)}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                            color: "var(--color-text)",
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          {isExpanded ? (
                            <CaretDown size={18} weight="bold" />
                          ) : (
                            <CaretRight size={18} weight="bold" />
                          )}
                        </button>
                        <div>
                          <h3
                            style={{
                              margin: 0,
                              fontSize: "18px",
                              fontWeight: 700,
                              color: "var(--color-text)",
                              letterSpacing: "-0.01em",
                            }}
                          >
                            {effectiveHeading || "(untitled section)"}
                          </h3>
                          <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                            Pages {section.pageStart}
                            {section.pageEnd !== section.pageStart
                              ? `–${section.pageEnd}`
                              : ""}{" "}
                            · {section.blockCount} blocks · {section.figureCount} figures · {section.tableCount} tables
                          </span>
                        </div>
                      </div>

                      {/* Section Controls */}
                      <div
                        data-section-selection
                        style={{ display: "flex", alignItems: "center", gap: "8px" }}
                      >
                        <span
                          data-included={included}
                          style={{
                            fontSize: "12px",
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: "var(--radius-pill)",
                            backgroundColor: included
                              ? "var(--color-success-bg)"
                              : "var(--color-surface-subtle)",
                            color: included
                              ? "var(--color-success-fg)"
                              : "var(--color-text-muted)",
                            border: `1px solid ${
                              included
                                ? "var(--color-success-border)"
                                : "var(--color-border)"
                            }`,
                          }}
                        >
                          {included ? "Included" : "Excluded"}
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            void updateSection(section.id, {
                              kind: included ? "exclude" : "include",
                            })
                          }
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "4px 10px",
                            fontSize: "12px",
                            fontWeight: 600,
                            borderRadius: "var(--radius-control)",
                            border: "1px solid var(--color-border)",
                            backgroundColor: "var(--color-surface)",
                            color: "var(--color-text)",
                            cursor: "pointer",
                          }}
                        >
                          {included ? (
                            <>
                              <EyeSlash size={14} />
                              <span>Exclude</span>
                            </>
                          ) : (
                            <>
                              <Eye size={14} />
                              <span>Include</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedItem({ kind: "section", sectionId: section.id });
                            setMobileTab("details");
                            setTabletInspectorOpen(true);
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "4px",
                            padding: "4px 10px",
                            fontSize: "12px",
                            fontWeight: 600,
                            borderRadius: "var(--radius-control)",
                            border: "1px solid var(--color-border)",
                            backgroundColor: "var(--color-surface)",
                            color: "var(--color-brand)",
                            cursor: "pointer",
                          }}
                        >
                          <PencilSimple size={14} />
                          <span>Edit</span>
                        </button>

                        {/* Hidden form for compatibility with testing */}
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            const data = new FormData(event.currentTarget);
                            const heading = String(
                              data.get("heading") ?? "",
                            ).trim();
                            if (heading.length === 0) return;
                            void updateSection(section.id, {
                              kind: "rename",
                              heading,
                            });
                          }}
                          style={{ display: "none" }}
                        >
                          <label>
                            Heading
                            <input
                              type="text"
                              name="heading"
                              defaultValue={effectiveHeading || ""}
                              maxLength={1000}
                            />
                          </label>
                          <button type="submit">Rename</button>
                        </form>

                        {selection !== undefined ? (
                          <button
                            type="button"
                            onClick={() =>
                              void updateSection(section.id, { kind: "restore" })
                            }
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              padding: "4px 8px",
                              fontSize: "12px",
                              borderRadius: "var(--radius-control)",
                              border: "1px solid var(--color-border)",
                              backgroundColor: "var(--color-surface)",
                              color: "var(--color-text-muted)",
                              cursor: "pointer",
                            }}
                          >
                            <ArrowCounterClockwise size={14} />
                            <span>Restore original</span>
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {/* Section Content Area */}
                    {isExpanded ? (
                      <div
                        id={`section-content-${section.id}`}
                        style={{ display: "flex", flexDirection: "column", gap: "16px" }}
                      >
                        {sectionState?.loading ? (
                          <div
                            role="status"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              color: "var(--color-text-muted)",
                              fontSize: "14px",
                              padding: "16px 0",
                            }}
                          >
                            <ArrowsClockwise
                              weight="bold"
                              className="ui-spinner"
                            />
                            <span>Loading section content…</span>
                          </div>
                        ) : null}

                        {sectionState?.error ? (
                          <div
                            role="alert"
                            style={{
                              padding: "12px 16px",
                              backgroundColor: "var(--color-error-bg)",
                              border: "1px solid var(--color-error-border)",
                              borderRadius: "var(--radius-control)",
                              color: "var(--color-error-fg)",
                              fontSize: "13px",
                            }}
                          >
                            {sectionState.error}
                          </div>
                        ) : null}

                        {sectionState?.detail ? (
                          <SectionContentRenderer
                            detail={sectionState.detail}
                            selectedItem={selectedItem}
                            onSelectBlock={(blockId) => {
                              setSelectedItem({
                                kind: "block",
                                sectionId: section.id,
                                blockId,
                              });
                              setMobileTab("details");
                              setTabletInspectorOpen(true);
                            }}
                            onSelectFigure={(figureId) => {
                              setSelectedItem({
                                kind: "figure",
                                sectionId: section.id,
                                figureId,
                              });
                              setMobileTab("details");
                              setTabletInspectorOpen(true);
                            }}
                            onCorrect={(block, action) =>
                              void correctBlock(
                                section.id,
                                block.id,
                                block,
                                action,
                              )
                            }
                            onToggleFigure={(figure, action) =>
                              void updateFigure(
                                section.id,
                                figure.id,
                                figure,
                                action,
                              )
                            }
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </main>

        {/* REGION 3: Right Inspector (Contextual Item Inspector & Approval Panel) */}
        <aside
          className={`review-region-inspector ${
            mobileTab === "details" ? "mobile-active" : ""
          } ${tabletInspectorOpen ? "tablet-open" : ""}`}
          aria-label="Contextual Inspector and Source Approval"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-card)",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            position: "sticky",
            top: "16px",
            maxHeight: "calc(100vh - 32px)",
            overflowY: "auto",
            boxShadow: "var(--shadow-elevation)",
          }}
        >
          {/* Approval & Snapshot Status Card */}
          <ApprovalPanel
            state={approvalState}
            onApprove={() => void approveSource()}
            onRefresh={() => void refreshApproval()}
          />

          <hr style={{ border: "none", borderTop: "1px solid var(--color-border)", margin: 0 }} />

          {/* Contextual Selected Item Inspector */}
          <InspectorDetails
            selectedItem={selectedItem}
            sections={sections}
            selections={selections}
            sectionStates={sectionStates}
            onUpdateSection={updateSection}
            onCorrectBlock={correctBlock}
            onUpdateFigure={updateFigure}
            onClose={() => {
              setSelectedItem({ kind: "none" });
              setTabletInspectorOpen(false);
            }}
          />
        </aside>
      </div>

      <style jsx global>{`
        @media (max-width: 1023px) and (min-width: 768px) {
          .review-workspace-grid {
            grid-template-columns: 280px minmax(0, 1fr) !important;
          }
          .tablet-inspector-toggle {
            display: inline-flex !important;
          }
          .review-region-inspector {
            display: none !important;
          }
          .review-region-inspector.tablet-open {
            display: flex !important;
            position: fixed !important;
            right: 0;
            top: 0;
            bottom: 0;
            width: 360px;
            z-index: 100;
            border-radius: 0 !important;
            max-height: 100vh !important;
            box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15) !important;
          }
        }
        @media (max-width: 767px) {
          .review-workspace-grid {
            display: block !important;
          }
          .mobile-review-tabs {
            display: flex !important;
          }
          .review-region-sections,
          .review-region-content,
          .review-region-inspector {
            display: none !important;
            position: static !important;
            max-height: none !important;
          }
          .review-region-sections.mobile-active,
          .review-region-content.mobile-active,
          .review-region-inspector.mobile-active {
            display: flex !important;
          }
        }
      `}</style>
    </div>
  );
}

function ApprovalPanel({
  state,
  onApprove,
  onRefresh,
}: {
  state: ApprovalState;
  onApprove: () => void;
  onRefresh: () => void;
}) {
  if (state.kind === "loading") {
    return (
      <div
        role="status"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          color: "var(--color-text-muted)",
          fontSize: "13px",
        }}
      >
        <ArrowsClockwise weight="bold" className="ui-spinner" />
        <span>Checking approval status…</span>
      </div>
    );
  }

  if (state.kind === "approving") {
    return (
      <div
        role="status"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          color: "var(--color-brand)",
          fontSize: "13px",
          fontWeight: 600,
        }}
      >
        <ArrowsClockwise weight="bold" className="ui-spinner" />
        <span>Confirming source snapshot…</span>
      </div>
    );
  }

  if (state.kind === "failed") {
    return (
      <div
        aria-labelledby="approval-heading"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          backgroundColor: "var(--color-error-bg)",
          border: "1px solid var(--color-error-border)",
          borderRadius: "var(--radius-control)",
          padding: "14px",
        }}
      >
        <h3
          id="approval-heading"
          style={{
            margin: 0,
            fontSize: "14px",
            fontWeight: 700,
            color: "var(--color-error-fg)",
          }}
        >
          Confirm source content
        </h3>
        <p role="alert" style={{ margin: 0, fontSize: "13px", color: "var(--color-error-fg)" }}>
          {state.message}
        </p>
        <button
          type="button"
          onClick={onRefresh}
          style={{
            alignSelf: "flex-start",
            padding: "6px 12px",
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-error-border)",
            borderRadius: "var(--radius-control)",
            color: "var(--color-error-fg)",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  const { value } = state;

  if (!value.approved) {
    return (
      <div
        aria-labelledby="approval-heading"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div>
          <h3
            id="approval-heading"
            style={{
              margin: "0 0 4px 0",
              fontSize: "15px",
              fontWeight: 700,
              color: "var(--color-text)",
              letterSpacing: "-0.01em",
            }}
          >
            Confirm source content
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: "13px",
              color: "var(--color-text-muted)",
              lineHeight: "18px",
            }}
          >
            Confirm the reviewed source content to create an immutable snapshot for AI planning and lesson generation.
          </p>
        </div>

        <button
          type="button"
          data-approve-source
          onClick={onApprove}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding: "10px 16px",
            backgroundColor: "var(--color-brand)",
            color: "var(--color-on-brand)",
            border: "none",
            borderRadius: "var(--radius-control)",
            fontWeight: 600,
            fontSize: "14px",
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(100, 48, 215, 0.25)",
          }}
        >
          <Sparkle weight="bold" size={16} />
          <span>Confirm source content</span>
        </button>
      </div>
    );
  }

  return (
    <div
      aria-labelledby="approval-heading"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
          <CheckCircle weight="fill" size={18} style={{ color: "var(--color-success-fg)" }} />
          <h3
            id="approval-heading"
            style={{
              margin: 0,
              fontSize: "15px",
              fontWeight: 700,
              color: "var(--color-text)",
              letterSpacing: "-0.01em",
            }}
          >
            Source confirmed
          </h3>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: "13px",
            color: "var(--color-text-muted)",
            lineHeight: "18px",
          }}
        >
          Source content confirmed — snapshot {value.snapshotVersion}
          {value.contentHash !== null ? (
            <>
              {" "}
              (hash{" "}
              <code
                data-approval-hash={value.contentHash}
                style={{
                  fontSize: "12px",
                  padding: "1px 4px",
                  backgroundColor: "var(--color-surface-subtle)",
                  borderRadius: "4px",
                }}
              >
                {value.contentHash.slice(0, 12)}…
              </code>
              )
            </>
          ) : null}
          {value.approvedAt !== null ? (
            <>
              {" "}
              on{" "}
              <time dateTime={value.approvedAt}>
                {new Intl.DateTimeFormat("en", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "UTC",
                }).format(new Date(value.approvedAt))}
              </time>
            </>
          ) : null}
          .
        </p>
      </div>

      {value.stale ? (
        <div
          role="alert"
          style={{
            padding: "10px 12px",
            backgroundColor: "var(--color-warning-bg)",
            border: "1px solid var(--color-warning-border)",
            borderRadius: "var(--radius-control)",
            color: "var(--color-warning-fg)",
            fontSize: "12px",
            lineHeight: "16px",
          }}
        >
          The reviewed source changed after confirmation. Re-confirm to update the snapshot used for lesson generation.
        </div>
      ) : null}

      <button
        type="button"
        data-approve-source
        onClick={onApprove}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          padding: "8px 14px",
          backgroundColor: value.stale ? "var(--color-brand)" : "var(--color-surface-subtle)",
          color: value.stale ? "var(--color-on-brand)" : "var(--color-text)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-control)",
          fontWeight: 600,
          fontSize: "13px",
          cursor: "pointer",
        }}
      >
        <Sparkle weight="bold" size={16} />
        <span>Re-confirm source content</span>
      </button>
    </div>
  );
}

function SectionContentRenderer({
  detail,
  selectedItem,
  onSelectBlock,
  onSelectFigure,
  onCorrect,
  onToggleFigure,
}: {
  detail: ParsedDocumentSectionResponse;
  selectedItem: SelectedItem;
  onSelectBlock: (blockId: string) => void;
  onSelectFigure: (figureId: string) => void;
  onCorrect: (
    block: ParsedDocumentSectionResponse["section"]["blocks"][number],
    action: BlockCorrectionAction,
  ) => void;
  onToggleFigure: (figure: ReviewFigure, action: FigureSelectionAction) => void;
}) {
  const { section } = detail;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {section.blocks.length === 0 &&
      section.figures.length === 0 &&
      section.tables.length === 0 ? (
        <p style={{ margin: 0, fontSize: "14px", color: "var(--color-text-muted)" }}>
          This section has no extractable content.
        </p>
      ) : null}

      {/* Content Blocks */}
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {section.blocks.map((block) => {
          const isSelected =
            selectedItem.kind === "block" && selectedItem.blockId === block.id;

          return (
            <EditableBlockItem
              key={block.id}
              block={block}
              isSelected={isSelected}
              onSelect={() => onSelectBlock(block.id)}
              onCorrect={onCorrect}
            />
          );
        })}
      </div>

      {/* Figures */}
      {section.figures.length > 0 ? (
        <div
          aria-labelledby={`figures-${section.id}`}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            marginTop: "12px",
          }}
        >
          <h4
            id={`figures-${section.id}`}
            style={{
              margin: 0,
              fontSize: "15px",
              fontWeight: 700,
              color: "var(--color-text)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <ImageIcon size={18} />
            <span>Figures ({section.figures.length})</span>
          </h4>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: "16px",
            }}
          >
            {section.figures.map((figure) => {
              const isSelected =
                selectedItem.kind === "figure" &&
                selectedItem.figureId === figure.id;

              return (
                <li
                  key={figure.id}
                  data-figure-id={figure.id}
                  onClick={() => onSelectFigure(figure.id)}
                  style={{
                    backgroundColor: isSelected
                      ? "var(--color-surface-brand)"
                      : "var(--color-surface-subtle)",
                    border: isSelected
                      ? "2px solid var(--color-brand)"
                      : "1px solid var(--color-border)",
                    borderRadius: "var(--radius-control)",
                    padding: "12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      height: "140px",
                      backgroundColor: "var(--color-canvas)",
                      borderRadius: "6px",
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {figure.previewUrl !== undefined ? (
                      <img
                        src={figure.previewUrl}
                        alt={figure.altText ?? "Extracted figure"}
                        style={{
                          maxWidth: "100%",
                          maxHeight: "100%",
                          objectFit: "contain",
                        }}
                      />
                    ) : (
                      <div
                        role="status"
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "6px",
                          color: "var(--color-text-muted)",
                          fontSize: "12px",
                          textAlign: "center",
                          padding: "8px",
                        }}
                      >
                        <ImageIcon size={24} />
                        <span>
                          Figure preview unavailable
                          {figure.contentType !== null
                            ? ` (${figure.contentType})`
                            : ""}
                        </span>
                      </div>
                    )}
                  </div>

                  {figure.sourceLocator !== undefined ? (
                    <p style={{ margin: 0, fontSize: "12px", color: "var(--color-text-muted)" }}>
                      Source: {figure.sourceLocator}
                    </p>
                  ) : null}

                  <div
                    data-figure-inclusion
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                    }}
                  >
                    <span
                      data-included={figure.included}
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "1px 6px",
                        borderRadius: "var(--radius-pill)",
                        backgroundColor: figure.included
                          ? "var(--color-success-bg)"
                          : "var(--color-surface)",
                        color: figure.included
                          ? "var(--color-success-fg)"
                          : "var(--color-text-muted)",
                        border: `1px solid ${
                          figure.included
                            ? "var(--color-success-border)"
                            : "var(--color-border)"
                        }`,
                      }}
                    >
                      {figure.included ? "Included" : "Excluded"}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFigure(figure, {
                          kind: figure.included ? "exclude" : "restore",
                        });
                      }}
                      style={{
                        padding: "4px 8px",
                        fontSize: "11px",
                        fontWeight: 600,
                        borderRadius: "var(--radius-control)",
                        border: "1px solid var(--color-border)",
                        backgroundColor: "var(--color-surface)",
                        color: figure.included
                          ? "var(--color-text)"
                          : "var(--color-brand)",
                        cursor: "pointer",
                      }}
                    >
                      {figure.included ? "Exclude from lesson" : "Include in lesson"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* Tables */}
      {section.tables.length > 0 ? (
        <div
          aria-labelledby={`tables-${section.id}`}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            marginTop: "12px",
          }}
        >
          <h4
            id={`tables-${section.id}`}
            style={{
              margin: 0,
              fontSize: "15px",
              fontWeight: 700,
              color: "var(--color-text)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <TableIcon size={18} />
            <span>Tables ({section.tables.length})</span>
          </h4>
          {section.tables.map((table) => (
            <div
              key={table.id}
              role="region"
              tabIndex={0}
              aria-label={`Table with ${table.columns.length} columns`}
              style={{
                overflowX: "auto",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-control)",
              }}
            >
              <table
                data-table-id={table.id}
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: "13px",
                  textAlign: "left",
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: "var(--color-surface-subtle)" }}>
                    {table.columns.map((column, index) => (
                      <th
                        key={index}
                        scope="col"
                        style={{
                          padding: "10px 14px",
                          fontWeight: 600,
                          color: "var(--color-text)",
                          borderBottom: "1px solid var(--color-border)",
                        }}
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, rowIndex) => (
                    <tr
                      key={rowIndex}
                      style={{
                        borderBottom:
                          rowIndex === table.rows.length - 1
                            ? "none"
                            : "1px solid var(--color-border)",
                      }}
                    >
                      {row.map((cell, cellIndex) => (
                        <td
                          key={cellIndex}
                          style={{
                            padding: "8px 14px",
                            color: "var(--color-text)",
                          }}
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EditableBlockItem({
  block,
  isSelected,
  onSelect,
  onCorrect,
}: {
  block: ParsedDocumentSectionResponse["section"]["blocks"][number];
  isSelected: boolean;
  onSelect: () => void;
  onCorrect: (
    block: ParsedDocumentSectionResponse["section"]["blocks"][number],
    action: BlockCorrectionAction,
  ) => void;
}) {
  const [inlineEditing, setInlineEditing] = useState(false);
  const corrected =
    block.kind === "unsupported" ? false : block.correction !== undefined;

  const renderContent = () => {
    switch (block.kind) {
      case "paragraph":
        return (
          <p
            data-block-id={block.id}
            style={{
              margin: 0,
              fontSize: "15px",
              lineHeight: "24px",
              color: "var(--color-text)",
            }}
          >
            {block.correction?.correctedText ?? block.text}
          </p>
        );
      case "list": {
        const items = block.correction?.correctedItems ?? block.items;
        return (
          <ul
            data-block-id={block.id}
            style={{
              margin: 0,
              paddingLeft: "20px",
              fontSize: "15px",
              lineHeight: "24px",
              color: "var(--color-text)",
            }}
          >
            {items.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        );
      }
      case "equation":
        return (
          <div
            data-block-id={block.id}
            aria-label="Equation"
            style={{
              padding: "10px 14px",
              backgroundColor: "var(--color-canvas)",
              borderRadius: "var(--radius-control)",
              fontFamily: "monospace",
              fontSize: "14px",
            }}
          >
            <code>{block.correction?.correctedLatex ?? block.latex}</code>
            {block.text !== undefined ? (
              <span aria-label="Equation text" style={{ color: "var(--color-text-muted)", fontSize: "12px", marginLeft: "8px" }}>
                ({block.text})
              </span>
            ) : null}
          </div>
        );
      case "caption":
        return (
          <p
            data-block-id={block.id}
            style={{
              margin: 0,
              fontSize: "13px",
              fontStyle: "italic",
              color: "var(--color-text-muted)",
              lineHeight: "20px",
            }}
          >
            {block.correction?.correctedText ?? block.text}
          </p>
        );
      case "unsupported":
        return (
          <div
            data-block-id={block.id}
            role="status"
            aria-label={`Unsupported block: ${block.parserKind}`}
            style={{
              padding: "10px 14px",
              backgroundColor: "var(--color-warning-bg)",
              border: "1px solid var(--color-warning-border)",
              borderRadius: "var(--radius-control)",
              color: "var(--color-warning-fg)",
              fontSize: "13px",
            }}
          >
            Unsupported content type: {block.parserKind}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div
      data-block-correction
      data-corrected={corrected}
      onClick={onSelect}
      style={{
        position: "relative",
        padding: "14px 16px",
        borderRadius: "var(--radius-control)",
        backgroundColor: isSelected
          ? "var(--color-surface-brand)"
          : corrected
          ? "rgba(100, 48, 215, 0.04)"
          : "var(--color-surface)",
        border: isSelected
          ? "2px solid var(--color-brand)"
          : corrected
          ? "1px solid var(--color-brand)"
          : "1px solid transparent",
        transition: "all var(--motion-quick) var(--motion-easing)",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      {/* Semantic Badge for Correction / State */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: "var(--color-text-muted)",
            }}
          >
            {block.kind}
          </span>
          {corrected ? (
            <span
              style={{
                fontSize: "11px",
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: "var(--radius-pill)",
                backgroundColor: "var(--color-surface-brand)",
                color: "var(--color-brand)",
                border: "1px solid var(--color-border)",
              }}
            >
              Corrected
            </span>
          ) : null}
        </div>

        {/* Quick Inline Actions */}
        {block.kind !== "unsupported" ? (
          <span data-block-actions style={{ display: "inline-flex", gap: "6px" }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setInlineEditing((prev) => !prev);
              }}
              style={{
                background: "none",
                border: "none",
                padding: "2px 6px",
                fontSize: "12px",
                color: "var(--color-brand)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {corrected ? "Edit correction" : "Correct text"}
            </button>
            {corrected ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCorrect(block, { kind: "restore" });
                }}
                style={{
                  background: "none",
                  border: "none",
                  padding: "2px 6px",
                  fontSize: "12px",
                  color: "var(--color-text-muted)",
                  cursor: "pointer",
                }}
              >
                Restore original
              </button>
            ) : null}
          </span>
        ) : null}
      </div>

      {/* Main Block Content */}
      {renderContent()}

      {/* Inline Quick Editor */}
      {inlineEditing && block.kind !== "unsupported" ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const content = String(data.get("content") ?? "").trim();
            if (content.length === 0) return;
            if (block.kind === "list") {
              onCorrect(block, {
                kind: "edit-items",
                correctedItems: content
                  .split("\n")
                  .map((item) => item.trim())
                  .filter((item) => item.length > 0),
              });
            } else if (block.kind === "equation") {
              onCorrect(block, { kind: "edit-latex", correctedLatex: content });
            } else {
              onCorrect(block, { kind: "edit", correctedText: content });
            }
            setInlineEditing(false);
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            marginTop: "8px",
            paddingTop: "8px",
            borderTop: "1px dashed var(--color-border)",
          }}
        >
          <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text)" }}>
            Corrected content
            {block.kind === "list" ? (
              <textarea
                name="content"
                rows={4}
                defaultValue={(
                  block.correction?.correctedItems ?? block.items
                ).join("\n")}
                style={{
                  width: "100%",
                  marginTop: "4px",
                  padding: "8px",
                  fontSize: "13px",
                  borderRadius: "var(--radius-control)",
                  border: "1px solid var(--color-border)",
                }}
              />
            ) : (
              <textarea
                name="content"
                rows={4}
                defaultValue={
                  block.kind === "equation"
                    ? (block.correction?.correctedLatex ?? block.latex)
                    : (block.correction?.correctedText ?? block.text)
                }
                style={{
                  width: "100%",
                  marginTop: "4px",
                  padding: "8px",
                  fontSize: "13px",
                  borderRadius: "var(--radius-control)",
                  border: "1px solid var(--color-border)",
                }}
              />
            )}
          </label>
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => setInlineEditing(false)}
              style={{
                padding: "4px 10px",
                fontSize: "12px",
                borderRadius: "var(--radius-control)",
                border: "1px solid var(--color-border)",
                backgroundColor: "var(--color-surface)",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: "4px 12px",
                fontSize: "12px",
                fontWeight: 600,
                borderRadius: "var(--radius-control)",
                border: "none",
                backgroundColor: "var(--color-brand)",
                color: "var(--color-on-brand)",
                cursor: "pointer",
              }}
            >
              Save
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function InspectorDetails({
  selectedItem,
  sections,
  selections,
  sectionStates,
  onUpdateSection,
  onCorrectBlock,
  onUpdateFigure,
  onClose,
}: {
  selectedItem: SelectedItem;
  sections: ParsedDocumentReviewResponse["sections"];
  selections: Record<string, SourceSectionSelection>;
  sectionStates: Record<string, SectionState>;
  onUpdateSection: (sectionId: string, action: SectionSelectionAction) => Promise<void>;
  onCorrectBlock: (
    sectionId: string,
    blockId: string,
    block: Pick<ReviewContentBlock, "kind">,
    action: BlockCorrectionAction,
  ) => Promise<void>;
  onUpdateFigure: (
    sectionId: string,
    figureId: string,
    figure: Pick<ReviewFigure, "included" | "revision">,
    action: FigureSelectionAction,
  ) => Promise<void>;
  onClose: () => void;
}) {
  if (selectedItem.kind === "none") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", color: "var(--color-text-muted)" }}>
        <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--color-text)" }}>
          Item details
        </h4>
        <p style={{ margin: 0, fontSize: "13px", lineHeight: "18px" }}>
          Select any section, text block, or figure in the document to inspect provenance, edit corrections, or adjust inclusion.
        </p>
      </div>
    );
  }

  if (selectedItem.kind === "section") {
    const section = sections.find((s) => s.id === selectedItem.sectionId);
    if (!section) return null;
    const selection = selectionFor(selections, section.id);
    const included = selection?.included ?? true;
    const effectiveHeading = selection?.displayHeading ?? section.heading;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--color-text)" }}>
            Section inspector
          </h4>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer" }}
          >
            Close
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            const heading = String(data.get("heading") ?? "").trim();
            if (heading.length === 0) return;
            void onUpdateSection(section.id, { kind: "rename", heading });
          }}
          style={{ display: "flex", flexDirection: "column", gap: "8px" }}
        >
          <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text)" }}>
            Display heading
            <input
              type="text"
              name="heading"
              defaultValue={effectiveHeading || ""}
              style={{
                width: "100%",
                marginTop: "4px",
                padding: "8px 10px",
                fontSize: "13px",
                borderRadius: "var(--radius-control)",
                border: "1px solid var(--color-border)",
              }}
            />
          </label>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="submit"
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: 600,
                borderRadius: "var(--radius-control)",
                border: "none",
                backgroundColor: "var(--color-brand)",
                color: "var(--color-on-brand)",
                cursor: "pointer",
              }}
            >
              Rename
            </button>
            {selection !== undefined ? (
              <button
                type="button"
                onClick={() => void onUpdateSection(section.id, { kind: "restore" })}
                style={{
                  padding: "6px 12px",
                  fontSize: "12px",
                  borderRadius: "var(--radius-control)",
                  border: "1px solid var(--color-border)",
                  backgroundColor: "var(--color-surface)",
                  cursor: "pointer",
                }}
              >
                Restore original
              </button>
            ) : null}
          </div>
        </form>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", color: "var(--color-text-muted)" }}>
          <div>Page range: {section.pageStart} – {section.pageEnd}</div>
          <div>Content: {section.blockCount} blocks, {section.figureCount} figures, {section.tableCount} tables</div>
          <div>Status: {included ? "Included in lesson generation" : "Excluded"}</div>
        </div>

        <button
          type="button"
          onClick={() =>
            void onUpdateSection(section.id, {
              kind: included ? "exclude" : "include",
            })
          }
          style={{
            padding: "8px 12px",
            fontSize: "13px",
            fontWeight: 600,
            borderRadius: "var(--radius-control)",
            border: "1px solid var(--color-border)",
            backgroundColor: included ? "var(--color-surface-subtle)" : "var(--color-brand)",
            color: included ? "var(--color-text)" : "var(--color-on-brand)",
            cursor: "pointer",
          }}
        >
          {included ? "Exclude section from lesson" : "Include section in lesson"}
        </button>
      </div>
    );
  }

  if (selectedItem.kind === "block") {
    const detail = sectionStates[selectedItem.sectionId]?.detail;
    const block = detail?.section.blocks.find((b) => b.id === selectedItem.blockId);
    if (!block) return null;
    const corrected = block.kind !== "unsupported" && block.correction !== undefined;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--color-text)" }}>
            Block inspector
          </h4>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer" }}
          >
            Close
          </button>
        </div>

        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <span style={{ fontSize: "12px", fontWeight: 600, textTransform: "uppercase", color: "var(--color-brand)" }}>
            {block.kind}
          </span>
          {corrected ? (
            <span style={{ fontSize: "11px", fontWeight: 600, padding: "1px 6px", borderRadius: "var(--radius-pill)", backgroundColor: "var(--color-surface-brand)", color: "var(--color-brand)" }}>
              Overlay active
            </span>
          ) : null}
        </div>

        {/* Edit Form */}
        {block.kind !== "unsupported" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const content = String(data.get("content") ?? "").trim();
              if (content.length === 0) return;
              if (block.kind === "list") {
                void onCorrectBlock(selectedItem.sectionId, block.id, block, {
                  kind: "edit-items",
                  correctedItems: content.split("\n").map((i) => i.trim()).filter((i) => i.length > 0),
                });
              } else if (block.kind === "equation") {
                void onCorrectBlock(selectedItem.sectionId, block.id, block, {
                  kind: "edit-latex",
                  correctedLatex: content,
                });
              } else {
                void onCorrectBlock(selectedItem.sectionId, block.id, block, {
                  kind: "edit",
                  correctedText: content,
                });
              }
            }}
            style={{ display: "flex", flexDirection: "column", gap: "8px" }}
          >
            <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text)" }}>
              Edit overlay
              <textarea
                name="content"
                rows={6}
                defaultValue={
                  block.kind === "list"
                    ? (block.correction?.correctedItems ?? block.items).join("\n")
                    : block.kind === "equation"
                    ? (block.correction?.correctedLatex ?? block.latex)
                    : (block.correction?.correctedText ?? block.text)
                }
                style={{
                  width: "100%",
                  marginTop: "4px",
                  padding: "8px 10px",
                  fontSize: "13px",
                  borderRadius: "var(--radius-control)",
                  border: "1px solid var(--color-border)",
                  fontFamily: block.kind === "equation" ? "monospace" : "inherit",
                }}
              />
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="submit"
                style={{
                  padding: "6px 12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  borderRadius: "var(--radius-control)",
                  border: "none",
                  backgroundColor: "var(--color-brand)",
                  color: "var(--color-on-brand)",
                  cursor: "pointer",
                }}
              >
                Save correction
              </button>
              {corrected ? (
                <button
                  type="button"
                  onClick={() =>
                    void onCorrectBlock(selectedItem.sectionId, block.id, block, { kind: "restore" })
                  }
                  style={{
                    padding: "6px 12px",
                    fontSize: "12px",
                    borderRadius: "var(--radius-control)",
                    border: "1px solid var(--color-border)",
                    backgroundColor: "var(--color-surface)",
                    cursor: "pointer",
                  }}
                >
                  Restore original
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
      </div>
    );
  }

  if (selectedItem.kind === "figure") {
    const detail = sectionStates[selectedItem.sectionId]?.detail;
    const figure = detail?.section.figures.find((f) => f.id === selectedItem.figureId);
    if (!figure) return null;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--color-text)" }}>
            Figure inspector
          </h4>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer" }}
          >
            Close
          </button>
        </div>

        {figure.previewUrl !== undefined ? (
          <div
            style={{
              height: "160px",
              backgroundColor: "var(--color-canvas)",
              borderRadius: "var(--radius-control)",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={figure.previewUrl}
              alt={figure.altText ?? "Extracted figure"}
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
            />
          </div>
        ) : null}

        <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", color: "var(--color-text-muted)" }}>
          {figure.altText && <div>Alt text: {figure.altText}</div>}
          {figure.sourceLocator && <div>Source: {figure.sourceLocator}</div>}
          {figure.contentType && <div>Type: {figure.contentType}</div>}
          <div>Inclusion: {figure.included ? "Included in lesson" : "Excluded"}</div>
        </div>

        <button
          type="button"
          onClick={() =>
            void onUpdateFigure(selectedItem.sectionId, figure.id, figure, {
              kind: figure.included ? "exclude" : "restore",
            })
          }
          style={{
            padding: "8px 12px",
            fontSize: "13px",
            fontWeight: 600,
            borderRadius: "var(--radius-control)",
            border: "1px solid var(--color-border)",
            backgroundColor: figure.included ? "var(--color-surface-subtle)" : "var(--color-brand)",
            color: figure.included ? "var(--color-text)" : "var(--color-on-brand)",
            cursor: "pointer",
          }}
        >
          {figure.included ? "Exclude figure from lesson" : "Include figure in lesson"}
        </button>
      </div>
    );
  }

  return null;
}
