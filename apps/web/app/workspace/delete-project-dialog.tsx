"use client";

import React, { useState, useEffect } from "react";
import { Dialog } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import { Trash } from "@phosphor-icons/react";

export interface DeleteProjectDialogProps {
  isOpen: boolean;
  projectTitle: string;
  projectId: string;
  onClose: () => void;
}

export function DeleteProjectDialog({
  isOpen,
  projectTitle,
  projectId,
  onClose,
}: DeleteProjectDialogProps) {
  const [typedTitle, setTypedTitle] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTypedTitle("");
      setIsDeleting(false);
    }
  }, [isOpen]);

  const matchesTitle = typedTitle.trim().toLowerCase() === projectTitle.trim().toLowerCase();

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Delete lesson"
      description="This action cannot be undone."
      maxWidth="480px"
      footer={
        <div style={{ display: "flex", gap: "10px", width: "100%", justifyContent: "flex-end" }}>
          <Button
            type="button"
            variant="secondary"
            size="compact"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <form
            action={`/api/projects/${encodeURIComponent(projectId)}/delete`}
            method="post"
            onSubmit={() => setIsDeleting(true)}
          >
            <input type="hidden" name="confirm" value="delete" />
            <Button
              type="submit"
              variant="destructive"
              size="compact"
              disabled={!matchesTitle || isDeleting}
              isLoading={isDeleting}
              leftIcon={<Trash weight="bold" />}
            >
              Delete lesson
            </Button>
          </form>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <p style={{ margin: 0, fontSize: "14px", lineHeight: "22px", color: "var(--color-text)" }}>
          Permanently remove <strong>{projectTitle}</strong> and all associated source
          uploads, parsed figures, objectives, scripts, and storyboard versions from your workspace.
        </p>

        <Field
          id="confirm-delete-title"
          label="To confirm deletion, enter the lesson title:"
          helperText={`Type "${projectTitle}" to enable deletion.`}
        >
          <input
            id="confirm-delete-title"
            name="confirmTitle"
            type="text"
            value={typedTitle}
            onChange={(e) => setTypedTitle(e.target.value)}
            placeholder={projectTitle}
            autoFocus
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: "14px",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-control)",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text)",
              boxSizing: "border-box",
            }}
          />
        </Field>
      </div>
    </Dialog>
  );
}
