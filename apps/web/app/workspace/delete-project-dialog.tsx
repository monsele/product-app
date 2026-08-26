"use client";

import React, { useState, useEffect } from "react";

interface DeleteProjectDialogProps {
  isOpen: boolean;
  projectTitle: string;
  projectId: string;
  isDeleting: boolean;
  onClose: () => void;
  onConfirmDelete: (projectId: string) => void;
}

export function DeleteProjectDialog({
  isOpen,
  projectTitle,
  projectId,
  isDeleting,
  onClose,
  onConfirmDelete,
}: DeleteProjectDialogProps) {
  const [typedTitle, setTypedTitle] = useState("");

  useEffect(() => {
    if (isOpen) {
      setTypedTitle("");
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isDeleting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen) return null;

  const matchesTitle = typedTitle.trim() === projectTitle.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 text-rose-600">
            <svg
              className="w-6 h-6 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <h2 id="delete-dialog-title" className="text-lg font-bold text-slate-900">
              Delete Project
            </h2>
          </div>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            aria-label="Close dialog"
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed">
          This action will permanently delete <strong className="text-slate-900 font-semibold">{projectTitle}</strong> and all associated source documents, ingestion outputs, and generated lesson versions.
        </p>

        <div className="space-y-2 pt-2">
          <label htmlFor="confirm-project-title" className="block text-xs font-medium text-slate-700">
            To confirm, type <span className="font-mono text-slate-900 font-semibold select-all">{projectTitle}</span> below:
          </label>
          <input
            id="confirm-project-title"
            type="text"
            value={typedTitle}
            disabled={isDeleting}
            onChange={(e) => setTypedTitle(e.target.value)}
            placeholder="Type project title to confirm"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-rose-500 focus:border-rose-500 transition-shadow"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!matchesTitle || isDeleting}
            onClick={() => onConfirmDelete(projectId)}
            className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors shadow-xs flex items-center gap-2"
          >
            {isDeleting ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Deleting...
              </>
            ) : (
              "Confirm Deletion"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
