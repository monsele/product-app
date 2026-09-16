"use client";

import React, { useEffect, useState, type JSX } from "react";
import type { ProjectAsset } from "@avlp/schemas";
import { toast } from "../../../../components/ui/toast-provider";
import {
  completeTeacherAssetUpload,
  deleteTeacherAsset,
  fetchTeacherAssets,
  uploadTeacherAsset,
} from "./storyboard-scene-query";
import styles from "./storyboard.module.css";

/** Private-image selector kept separate from the immutable approved catalog. */
export function TeacherAssetPicker({
  projectId,
  disabled,
  selectedId,
  slot,
  onChange,
}: {
  projectId: string;
  disabled: boolean;
  selectedId: string;
  slot: string;
  onChange: (assetId: string) => void;
}): JSX.Element {
  const [assets, setAssets] = useState<readonly ProjectAsset[]>([]);
  const [file, setFile] = useState<File>();
  const [message, setMessage] = useState<string>();
  const [uploading, setUploading] = useState(false);
  const [validationSessionId, setValidationSessionId] = useState<string>();
  const refresh = async (): Promise<void> => {
    const next = await fetchTeacherAssets(projectId);
    setAssets(next.assets);
  };
  useEffect(() => {
    void refresh().catch(() => setAssets([]));
  }, [projectId]);
  const upload = async (): Promise<void> => {
    if (file === undefined) {
      setMessage("Choose an image first.");
      return;
    }
    try {
      setUploading(true);
      setMessage("Checking image safety and creating a preview…");
      const uploaded = await uploadTeacherAsset(projectId, file);
      setFile(undefined);
      if (uploaded.completion.status === "rejected") {
        const err = "Image was rejected during safety checks. Choose another image and retry.";
        setMessage(err);
        toast.error(err);
      } else if (uploaded.completion.status === "active") {
        await refresh();
        const msg = "Image validated successfully. Select it, then save the scene.";
        setMessage(msg);
        toast.success("Teacher image uploaded and validated.");
      } else {
        setValidationSessionId(uploaded.sessionId);
        setMessage("Image uploaded and queued for safety checking.");
        toast.info("Image uploaded, performing safety checks...");
      }
    } catch (error) {
      const err =
        error instanceof Error ? error.message : "The image upload failed.";
      setMessage(err);
      toast.error(err);
    } finally {
      setUploading(false);
    }
  };
  useEffect(() => {
    if (validationSessionId !== undefined) {
      const timer = window.setInterval(
        () =>
          void completeTeacherAssetUpload(projectId, validationSessionId)
            .then(async (result) => {
              if (result.status === "active") {
                await refresh();
                setValidationSessionId(undefined);
                const msg = "Image validated. Select it, then save the scene.";
                setMessage(msg);
                toast.success("Teacher image validated successfully.");
              } else if (result.status === "rejected") {
                setValidationSessionId(undefined);
                const err =
                  "Image was rejected during safety checks. Choose another image and retry.";
                setMessage(err);
                toast.error(err);
              }
            })
            .catch(() => undefined),
        2_000,
      );
      return () => window.clearInterval(timer);
    }
    return undefined;
  }, [projectId, validationSessionId]);
  const remove = async (): Promise<void> => {
    if (selectedId === "") return;
    try {
      setUploading(true);
      await deleteTeacherAsset(projectId, selectedId);
      onChange("");
      await refresh();
      setMessage("Uploaded image removed.");
      toast.info("Teacher image removed.");
    } catch (error) {
      const err =
        error instanceof Error ? error.message : "The uploaded image could not be removed.";
      setMessage(err);
      toast.error(err);
    } finally {
      setUploading(false);
    }
  };
  return (
    <fieldset className={styles.teacherAssetPicker} disabled={disabled || uploading}>
      <legend>Teacher replacement image: {slot}</legend>
      <p className={styles.assetPickerHint}>Use a project-private image when the approved catalog is not suitable.</p>
      <select
        aria-label={`Teacher replacement image: ${slot}`}
        className={styles.assetPickerInput}
        value={selectedId}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Remove replacement (choose a suggested asset)</option>
        {assets.map((asset) => (
          <option key={asset.assetId} value={asset.assetId}>
            Uploaded {asset.width}×{asset.height}
          </option>
        ))}
      </select>
      <label className={styles.fileField}>
        Upload PNG, JPEG, or WebP
        <input
          aria-label={`Upload replacement image: ${slot}`}
          type="file"
          accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
          onChange={(event) => setFile(event.target.files?.[0])}
        />
      </label>
      <div className={styles.assetPickerActions}>
        <button
          type="button"
          onClick={() => void upload()}
          disabled={file === undefined || uploading}
        >
          {uploading ? "Uploading image…" : "Upload image"}
        </button>
        <button
          type="button"
          onClick={() => void remove()}
          disabled={selectedId === "" || uploading}
        >
          Remove selected uploaded image
        </button>
      </div>
      {assets.find((asset) => asset.assetId === selectedId) !== undefined ? (
        <img
          alt="Selected teacher uploaded asset preview"
          src={assets.find((asset) => asset.assetId === selectedId)?.previewUrl}
          className={styles.teacherAssetPreview}
        />
      ) : null}
      {message === undefined ? null : <p className={styles.assetPickerStatus} role="status">{message}</p>}
    </fieldset>
  );
}
