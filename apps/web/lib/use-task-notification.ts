"use client";

import { useEffect, useRef } from "react";
import { toast } from "../components/ui/toast-provider";

export type TaskStatus =
  | "idle"
  | "queued"
  | "running"
  | "validating"
  | "generating"
  | "rendering"
  | "retry_wait"
  | "pending"
  | "in_progress"
  | "completed"
  | "ready"
  | "active"
  | "failed"
  | "rejected"
  | "validation_error"
  | "blocked"
  | string;

export interface TaskStatusNotificationOptions {
  taskName: string;
  status: TaskStatus | null | undefined;
  successMessage?: string;
  errorMessage?: string;
  title?: string;
  onSuccess?: () => void;
  onError?: () => void;
}

const ACTIVE_STATUSES = new Set([
  "queued",
  "running",
  "validating",
  "generating",
  "rendering",
  "retry_wait",
  "pending",
  "in_progress",
]);

const SUCCESS_STATUSES = new Set(["completed", "ready", "active", "done"]);

const FAILED_STATUSES = new Set([
  "failed",
  "rejected",
  "validation_error",
  "blocked",
  "error",
]);

export function evaluateTaskStatusTransition(
  prevStatus: TaskStatus | null | undefined,
  currentStatus: TaskStatus | null | undefined,
  wasActive = false,
): { action: "success" | "error" | "none"; wasActive: boolean } {
  if (!currentStatus || currentStatus === prevStatus) {
    return { action: "none", wasActive };
  }

  if (ACTIVE_STATUSES.has(currentStatus)) {
    return { action: "none", wasActive: true };
  }

  if (wasActive || (prevStatus && ACTIVE_STATUSES.has(prevStatus))) {
    if (SUCCESS_STATUSES.has(currentStatus)) {
      return { action: "success", wasActive: false };
    }
    if (FAILED_STATUSES.has(currentStatus)) {
      return { action: "error", wasActive: false };
    }
  }

  return { action: "none", wasActive: false };
}

export function useTaskStatusNotification({
  taskName,
  status,
  successMessage,
  errorMessage,
  title,
  onSuccess,
  onError,
}: TaskStatusNotificationOptions) {
  const previousStatusRef = useRef<TaskStatus | null | undefined>(status);
  const wasActiveRef = useRef<boolean>(
    status !== null && status !== undefined && ACTIVE_STATUSES.has(status),
  );

  useEffect(() => {
    const prevStatus = previousStatusRef.current;
    previousStatusRef.current = status;

    const evaluation = evaluateTaskStatusTransition(
      prevStatus,
      status,
      wasActiveRef.current,
    );

    wasActiveRef.current = evaluation.wasActive;

    if (evaluation.action === "success") {
      toast.success(
        successMessage || `${taskName} completed successfully.`,
        {
          title: title || `${taskName} Completed`,
        },
      );
      onSuccess?.();
    } else if (evaluation.action === "error") {
      toast.error(
        errorMessage || `${taskName} encountered an error.`,
        {
          title: title || `${taskName} Failed`,
        },
      );
      onError?.();
    }
  }, [status, taskName, successMessage, errorMessage, title, onSuccess, onError]);
}
