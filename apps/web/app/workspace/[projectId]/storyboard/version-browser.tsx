export type VersionBrowserMetadata = {
  count: number;
  latestModifiedAt: string | null;
  currentVersionId: string | null;
  versions: Array<{ id: string; versionNumber: number; reason: string; createdAt: string }>;
};

export function VersionBrowser(props: {
  metadata: VersionBrowserMetadata | null;
  preview: { id: string; durationSeconds: number; sceneCount: number; schemaVersion: string } | null;
  restoringVersionId: string | null;
  saving: boolean;
  storyboardAvailable: boolean;
  onPreview: (versionId: string) => void;
  onRestore: (versionId: string) => void;
  onSave: () => void;
}) {
  const { metadata } = props;
  return (
    <section aria-label="Lesson versions">
      <button type="button" onClick={props.onSave} disabled={props.saving || !props.storyboardAvailable}>
        {props.saving ? "Saving version..." : "Save version"}
      </button>
      {metadata !== null && metadata.latestModifiedAt !== null ? <p role="status">Version {metadata.count} saved {new Date(metadata.latestModifiedAt).toLocaleString()}.</p> : <p role="status">No saved lesson versions yet.</p>}
      {metadata?.versions.map((version) => (
        <div key={version.id}>
          <span>Version {version.versionNumber} ({version.reason}) saved {new Date(version.createdAt).toLocaleString()}.</span>{" "}
          <button type="button" onClick={() => props.onPreview(version.id)}>Preview metadata</button>{" "}
          <button type="button" disabled={props.restoringVersionId !== null || version.id === metadata.currentVersionId} onClick={() => props.onRestore(version.id)}>{props.restoringVersionId === version.id ? "Restoring..." : "Restore"}</button>
        </div>
      ))}
      {props.preview !== null ? <p role="status">Version metadata: {props.preview.sceneCount} scenes, {props.preview.durationSeconds} seconds, schema {props.preview.schemaVersion}.</p> : null}
    </section>
  );
}
import React from "react";
void React;
