"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  completeSourceUploadResponseSchema,
  sourceDocumentStatusResponseSchema,
  uploadSessionResponseSchema,
} from "@avlp/schemas";
import {
  FilePdf,
  FileDoc,
  UploadSimple,
  ArrowRight,
  ArrowsClockwise,
  CheckCircle,
  X,
} from "@phosphor-icons/react";
import { Button } from "../../../../components/ui/button";
import { Notice } from "../../../../components/ui/notice";
import { StatusLabel } from "../../../../components/ui/status-label";
import { calculateSha256 } from "./source-upload-checksum";

export type UploadState =
  | { kind: "idle" }
  | { kind: "uploading"; progress: number; loadedBytes: number; totalBytes: number }
  | { kind: "validating" }
  | { kind: "duplicate"; reused: boolean }
  | { kind: "failed"; message: string }
  | { kind: "complete"; reused: boolean };

function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function uploadToSignedUrl(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (progress: number, loaded: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    for (const [name, value] of Object.entries(headers))
      request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded / event.total, event.loaded, event.total);
      }
    };
    request.onerror = () => reject(new Error("The file upload failed. Check your network connection and retry."));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error("The file upload failed. Please try again."));
    };
    request.send(file);
  });
}

export function validationMessage(code: string | null): string {
  const messages: Record<string, string> = {
    EMPTY_FILE: "The file is empty. Choose a different document.",
    FILE_TOO_LARGE: "The file exceeds the 25 MB upload limit. Choose a smaller document.",
    UNSUPPORTED_FILE_TYPE: "Only PDF and DOCX files are supported.",
    MIME_MISMATCH: "The file type does not match its contents.",
    CORRUPT_DOCUMENT: "The document could not be read. Choose a different file.",
    PAGE_LIMIT_EXCEEDED: "Documents are limited to 20 pages. Choose a shorter excerpt.",
    MALWARE_DETECTED: "The file did not pass the safety check. Choose a different file.",
    DOCUMENT_INSPECTION_UNAVAILABLE: "The file could not be inspected. Please try uploading it again.",
    MALWARE_SCAN_UNAVAILABLE: "The safety check is temporarily unavailable. Please try again later.",
  };
  return code === null
    ? "The document could not be validated."
    : (messages[code] ?? "The document could not be validated.");
}

export interface SourceUploadFormProps {
  projectId: string;
  onUploadSuccess?: () => void;
}

export function SourceUploadForm({ projectId, onUploadSuccess }: SourceUploadFormProps) {
  const [file, setFile] = useState<File | undefined>();
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Poll validation endpoint when in validating state
  useEffect(() => {
    if (state.kind !== "validating") return;
    let cancelled = false;
    const check = async (): Promise<void> => {
      try {
        const response = await fetch(
          apiUrl(`/projects/${encodeURIComponent(projectId)}/source-document`),
          { credentials: "include" },
        );
        const payload: unknown = await response.json().catch(() => null);
        const parsed = response.ok
          ? sourceDocumentStatusResponseSchema.safeParse(payload)
          : undefined;
        if (cancelled || parsed === undefined || !parsed.success) return;
        const validation = parsed.data.validation;
        if (validation.status === "active") {
          const isReused = parsed.data.reuse.status === "reused";
          if (isReused) {
            setState({ kind: "duplicate", reused: true });
          } else {
            setState({ kind: "complete", reused: false });
          }
          onUploadSuccess?.();
        } else if (
          validation.status === "rejected" ||
          validation.status === "validation_error"
        ) {
          setState({
            kind: "failed",
            message: validationMessage(validation.code),
          });
        }
      } catch {
        // Preserve validating state; next poll will retry
      }
    };

    void check();
    const timer = window.setInterval(() => void check(), 300);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [projectId, state.kind, onUploadSuccess]);

  const handleFileChange = (selectedFile: File | undefined) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setState({ kind: "idle" });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const startUpload = async (): Promise<void> => {
    if (!file) {
      setState({ kind: "failed", message: "Choose a PDF or DOCX file first." });
      return;
    }
    const mediaType = file.name.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : file.name.toLowerCase().endsWith(".docx")
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : file.type || "application/pdf";

    if (!mediaType) {
      setState({
        kind: "failed",
        message: "Only PDF and DOCX files are supported.",
      });
      return;
    }

    try {
      setState({
        kind: "uploading",
        progress: 0,
        loadedBytes: 0,
        totalBytes: file.size,
      });

      const sessionResponse = await fetch(
        apiUrl(`/projects/${encodeURIComponent(projectId)}/source-upload`),
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            mediaType,
            sizeBytes: file.size,
            sha256: await calculateSha256(await file.arrayBuffer()),
          }),
        },
      );

      const sessionPayload: unknown = await sessionResponse
        .json()
        .catch(() => null);
      const session = sessionResponse.ok
        ? uploadSessionResponseSchema.safeParse(sessionPayload)
        : undefined;

      if (session === undefined || !session.success) {
        throw new Error("Unable to start the upload session. Please try again.");
      }

      await uploadToSignedUrl(
        session.data.uploadUrl,
        session.data.requiredHeaders,
        file,
        (progress, loaded, total) => {
          setState({
            kind: "uploading",
            progress,
            loadedBytes: loaded,
            totalBytes: total,
          });
        },
      );

      const completedResponse = await fetch(
        apiUrl(
          `/projects/${encodeURIComponent(projectId)}/source-upload/${encodeURIComponent(session.data.sessionId)}/complete`,
        ),
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      const completedPayload: unknown = await completedResponse
        .json()
        .catch(() => null);
      const completed = completedResponse.ok
        ? completeSourceUploadResponseSchema.safeParse(completedPayload)
        : undefined;

      if (completed === undefined || !completed.success) {
        throw new Error("The upload could not be completed. Please retry.");
      }

      if (completed.data.duplicateDetected) {
        setState({ kind: "duplicate", reused: true });
        onUploadSuccess?.();
      } else {
        setState({ kind: "validating" });
      }
    } catch (error) {
      setState({
        kind: "failed",
        message:
          error instanceof Error
            ? error.message
            : "The upload could not be completed. Please retry it.",
      });
    }
  };

  const isBusy = state.kind === "uploading" || state.kind === "validating";
  const isDone = state.kind === "complete" || state.kind === "duplicate";

  const getFileIcon = (fileName: string) => {
    if (fileName.toLowerCase().endsWith(".pdf")) {
      return <FilePdf size={28} weight="duotone" color="var(--color-error)" />;
    }
    return <FileDoc size={28} weight="duotone" color="var(--color-brand)" />;
  };

  return (
    <section
      aria-labelledby="source-upload-heading"
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-card)",
        padding: "32px",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
      }}
    >
      <div>
        <h2
          id="source-upload-heading"
          style={{
            margin: "0 0 6px 0",
            fontSize: "20px",
            fontWeight: 700,
            color: "var(--color-text)",
            letterSpacing: "-0.01em",
          }}
        >
          Source document
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: "14px",
            color: "var(--color-text-muted)",
            lineHeight: "20px",
          }}
        >
          Upload your teaching material to begin generating a grounded visual lesson.
        </p>
      </div>

      {/* Hidden native input */}
      <input
        ref={fileInputRef}
        id="source-document"
        type="file"
        aria-label="PDF or DOCX file"
        accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.docx"
        disabled={isBusy || isDone}
        style={{ display: "none" }}
        onChange={(event) => {
          handleFileChange(event.target.files?.[0]);
        }}
      />

      {/* Drop Zone (when no file is chosen or not yet uploading) */}
      {!file && !isDone && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Drop source document here or browse files"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          style={{
            border: `2px dashed ${isDragOver ? "var(--color-brand)" : "var(--color-border)"}`,
            backgroundColor: isDragOver
              ? "var(--color-surface-brand)"
              : "var(--color-surface-subtle)",
            borderRadius: "var(--radius-card)",
            padding: "48px 24px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "16px",
            cursor: "pointer",
            transition: "all var(--motion-quick) var(--motion-easing)",
            outline: "none",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
              color: isDragOver ? "var(--color-brand)" : "var(--color-text-muted)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <UploadSimple weight="bold" />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-text)" }}>
              Drag and drop your document here, or{" "}
              <span style={{ color: "var(--color-brand)", textDecoration: "underline" }}>
                browse
              </span>
            </span>
            <span style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>
              PDF or DOCX up to 20 pages (max 25 MB)
            </span>
          </div>
        </div>
      )}

      {/* Selected File Card */}
      {file && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderRadius: "var(--radius-control)",
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-surface-subtle)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0 }}>
            {getFileIcon(file.name)}
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--color-text)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {file.name}
              </span>
              <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                {formatBytes(file.size)}
              </span>
            </div>
          </div>

          {!isBusy && !isDone && (
            <button
              type="button"
              aria-label="Remove selected file"
              onClick={() => {
                setFile(undefined);
                setState({ kind: "idle" });
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--color-text-muted)",
                cursor: "pointer",
                padding: "6px",
                borderRadius: "var(--radius-control)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>
      )}

      {/* Uploading Measured Byte Progress */}
      {state.kind === "uploading" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "13px",
              color: "var(--color-text)",
              fontWeight: 500,
            }}
          >
            <span role="status" aria-live="polite">
              Uploading: {Math.round(state.progress * 100)}%
            </span>
            <span style={{ color: "var(--color-text-muted)" }}>
              {formatBytes(state.loadedBytes)} / {formatBytes(state.totalBytes)}
            </span>
          </div>
          <div
            style={{
              width: "100%",
              height: "8px",
              backgroundColor: "var(--color-surface-subtle)",
              borderRadius: "var(--radius-pill)",
              overflow: "hidden",
              border: "1px solid var(--color-border)",
            }}
          >
            <div
              style={{
                width: `${Math.round(state.progress * 100)}%`,
                height: "100%",
                backgroundColor: "var(--color-brand)",
                transition: "width 150ms ease-out",
              }}
            />
          </div>
        </div>
      )}

      {/* Validating State */}
      {state.kind === "validating" && (
        <div
          role="status"
          aria-live="polite"
          style={{
            padding: "16px",
            borderRadius: "var(--radius-control)",
            backgroundColor: "var(--color-info-bg)",
            border: "1px solid var(--color-info-border)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <StatusLabel status="in_progress" label="Validating document" size="compact" />
          <span style={{ fontSize: "14px", color: "var(--color-info-fg)" }}>
            Checking your document for safety and page limits.
          </span>
        </div>
      )}

      {/* Duplicate Detected (Decision / Safe Reuse Panel) */}
      {state.kind === "duplicate" && (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            padding: "18px 20px",
            borderRadius: "var(--radius-control)",
            backgroundColor: "var(--color-surface-subtle)",
            border: "1px solid var(--color-brand-border, var(--color-border))",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <CheckCircle size={20} weight="fill" color="var(--color-brand)" />
            <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-text)" }}>
              Compatible Ingestion Result Reused
            </span>
          </div>
          <p style={{ margin: 0, fontSize: "14px", color: "var(--color-text-muted)", lineHeight: "20px" }}>
            This document matches a previously validated source. A compatible extraction result was reused safely, saving processing time and costs.
          </p>
          <div style={{ marginTop: "4px" }}>
            <Button
              variant="primary"
              size="default"
              onClick={() => {
                window.location.assign(`/workspace/${projectId}/review`);
              }}
            >
              Review source <ArrowRight size={16} weight="bold" />
            </Button>
          </div>
        </div>
      )}

      {/* Validation Complete State */}
      {state.kind === "complete" && (
        <div
          role="status"
          aria-live="polite"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "16px",
            borderRadius: "var(--radius-control)",
            backgroundColor: "var(--color-success-bg)",
            border: "1px solid var(--color-success-border)",
          }}
        >
          <StatusLabel status="success" label="Validation Passed" size="compact" />
          <span style={{ fontSize: "14px", color: "var(--color-success-fg)" }}>
            {state.reused
              ? "Your document passed validation and a compatible parsing result was reused."
              : "Your document passed validation and is being prepared."}
          </span>
        </div>
      )}

      {/* Error / Failure Notice */}
      {state.kind === "failed" && (
        <Notice
          type="error"
          title="Upload rejected"
          message={state.message}
          actionLabel="Try again"
          onAction={() => {
            setState({ kind: "idle" });
          }}
        />
      )}

      {/* Action Buttons */}
      {!isDone && (
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <Button
            type="button"
            variant="primary"
            disabled={!file || isBusy}
            onClick={startUpload}
          >
            {state.kind === "failed" ? (
              <>
                <ArrowsClockwise size={16} weight="bold" /> Retry upload
              </>
            ) : isBusy ? (
              "Processing document…"
            ) : (
              <>
                <UploadSimple size={16} weight="bold" /> Upload document
              </>
            )}
          </Button>

          {!file && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              Browse files
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
