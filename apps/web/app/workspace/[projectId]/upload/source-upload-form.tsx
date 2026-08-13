"use client";

import { useState } from "react";
import {
  completeSourceUploadResponseSchema,
  uploadSessionResponseSchema,
} from "@avlp/schemas";

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading"; progress: number }
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

export function SourceUploadForm({ projectId }: { projectId: string }) {
  const [file, setFile] = useState<File>();
  const [state, setState] = useState<UploadState>({ kind: "idle" });

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
      setState({ kind: "complete" });
    } catch (error) {
      setState({
        kind: "failed",
        message: error instanceof Error ? error.message : "The upload failed.",
      });
    }
  };

  const busy = state.kind === "uploading";
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
      {state.kind === "complete" ? (
        <p role="status">Upload complete. Your document is being prepared.</p>
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
