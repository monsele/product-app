"use client";

import { useEffect, useState } from "react";
import {
  completeSourceUploadResponseSchema,
  sourceDocumentStatusResponseSchema,
  uploadSessionResponseSchema,
} from "@avlp/schemas";

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading"; progress: number }
  | { kind: "validating" }
  | { kind: "failed"; message: string }
  | { kind: "complete" };

function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;
}

async function checksum(file: File): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function uploadToSignedUrl(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (progress: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    for (const [name, value] of Object.entries(headers))
      request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onerror = () => reject(new Error("The file upload failed."));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error("The file upload failed."));
    };
    request.send(file);
  });
}

function validationMessage(code: string | null): string {
  const messages: Record<string, string> = {
    EMPTY_FILE: "The file is empty. Choose a different document.",
    FILE_TOO_LARGE: "The file is larger than the allowed upload size.",
    UNSUPPORTED_FILE_TYPE: "Only PDF and DOCX files are supported.",
    MIME_MISMATCH: "The file type does not match its contents.",
    CORRUPT_DOCUMENT:
      "The document could not be read. Choose a different file.",
    PAGE_LIMIT_EXCEEDED: "Documents are limited to 20 pages.",
    MALWARE_DETECTED:
      "The file did not pass the safety check. Choose a different file.",
    DOCUMENT_INSPECTION_UNAVAILABLE:
      "The file could not be inspected. Please try uploading it again.",
    MALWARE_SCAN_UNAVAILABLE:
      "The safety check is temporarily unavailable. Please try again later.",
  };
  return code === null
    ? "The document could not be validated."
    : (messages[code] ?? "The document could not be validated.");
}

export function SourceUploadForm({ projectId }: { projectId: string }) {
  const [file, setFile] = useState<File>();
  const [state, setState] = useState<UploadState>({ kind: "idle" });

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
        if (validation.status === "active") setState({ kind: "complete" });
        else if (
          validation.status === "rejected" ||
          validation.status === "validation_error"
        )
          setState({
            kind: "failed",
            message: validationMessage(validation.code),
          });
      } catch {
        // Preserve the pending state; the next poll can recover from a transient failure.
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [projectId, state.kind]);

  const startUpload = async (): Promise<void> => {
    if (file === undefined) {
      setState({ kind: "failed", message: "Choose a PDF or DOCX file first." });
      return;
    }
    const mediaType = file.name.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : file.name.toLowerCase().endsWith(".docx")
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : undefined;
    if (mediaType === undefined) {
      setState({
        kind: "failed",
        message: "Only PDF and DOCX files are supported.",
      });
      return;
    }
    try {
      setState({ kind: "uploading", progress: 0 });
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
            sha256: await checksum(file),
          }),
        },
      );
      const sessionPayload: unknown = await sessionResponse
        .json()
        .catch(() => null);
      const session = sessionResponse.ok
        ? uploadSessionResponseSchema.safeParse(sessionPayload)
        : undefined;
      if (session === undefined || !session.success)
        throw new Error("Unable to start the upload. Please try again.");
      await uploadToSignedUrl(
        session.data.uploadUrl,
        session.data.requiredHeaders,
        file,
        (progress) => setState({ kind: "uploading", progress }),
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
      if (completed === undefined || !completed.success)
        throw new Error("The upload could not be completed. Please retry it.");
      setState({ kind: "validating" });
    } catch (error) {
      setState({
        kind: "failed",
        message: error instanceof Error ? error.message : "The upload failed.",
      });
    }
  };

  const busy = state.kind === "uploading" || state.kind === "validating";
  return (
    <section aria-labelledby="source-upload-heading">
      <h2 id="source-upload-heading">Source document</h2>
      <p>Upload one PDF or DOCX file. Your document stays private.</p>
      <label htmlFor="source-document">PDF or DOCX file</label>
      <input
        id="source-document"
        type="file"
        accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.pdf,.docx"
        disabled={busy || state.kind === "complete"}
        onChange={(event) => {
          setFile(event.target.files?.[0]);
          setState({ kind: "idle" });
        }}
      />
      {state.kind === "uploading" ? (
        <p role="status">Uploading: {Math.round(state.progress * 100)}%</p>
      ) : null}
      {state.kind === "failed" ? <p role="alert">{state.message}</p> : null}
      {state.kind === "validating" ? (
        <p role="status">Checking your document for safety and page limits.</p>
      ) : null}
      {state.kind === "complete" ? (
        <p role="status">
          Your document passed validation and is being prepared.
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy || state.kind === "complete"}
        onClick={startUpload}
      >
        {state.kind === "failed" ? "Retry upload" : "Upload document"}
      </button>
    </section>
  );
}
