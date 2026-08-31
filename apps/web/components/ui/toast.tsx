"use client";

import React from "react";
import {
  CheckCircle,
  XCircle,
  Warning,
  Info,
  CircleNotch,
  X,
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import styles from "./toast.module.css";

export type ToastType = "success" | "error" | "warning" | "info" | "loading";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string | undefined;
  message: React.ReactNode;
  duration?: number | undefined;
  action?: ToastAction | undefined;
  dismissible?: boolean | undefined;
}

export interface ToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
}

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={17} weight="fill" />,
  error: <XCircle size={17} weight="fill" />,
  warning: <Warning size={17} weight="fill" />,
  info: <Info size={17} weight="fill" />,
  loading: <CircleNotch size={17} weight="bold" />,
};

const ICON_CLASSES: Record<ToastType, string> = {
  success: styles.successIcon ?? "",
  error: styles.errorIcon ?? "",
  warning: styles.warningIcon ?? "",
  info: styles.infoIcon ?? "",
  loading: styles.loadingIcon ?? "",
};

export function Toast({ toast, onDismiss, onPause, onResume }: ToastProps) {
  const reduceMotion = useReducedMotion();
  const isAlert = toast.type === "error";
  const isLoading = toast.type === "loading";

  // A loading toast has no deadline, so it gets no countdown hairline.
  const showProgress =
    !isLoading && toast.duration !== undefined && toast.duration > 0;

  const pause = () => onPause?.(toast.id);
  const resume = () => onResume?.(toast.id);

  return (
    <motion.div
      layout={!reduceMotion}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      drag={reduceMotion ? false : "x"}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0.02, right: 0.6 }}
      onDragEnd={(_, info) => {
        if (info.offset.x > 88 || info.velocity.x > 520) onDismiss(toast.id);
      }}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocusCapture={pause}
      onBlurCapture={resume}
      role={isAlert ? "alert" : "status"}
      aria-live={isAlert ? "assertive" : "polite"}
      aria-atomic="true"
      className={`${styles.toast} ui-toast ui-toast-${toast.type}`}
      data-testid={`toast-${toast.type}`}
    >
      <span
        className={`${styles.icon} ${ICON_CLASSES[toast.type]} ${
          isLoading && !reduceMotion ? styles.spinning : ""
        }`}
        aria-hidden="true"
      >
        {ICONS[toast.type]}
      </span>

      <div className={styles.content}>
        {toast.title !== undefined && (
          <span className={styles.title}>{toast.title}</span>
        )}
        <div className={styles.message}>{toast.message}</div>
      </div>

      {toast.action !== undefined && (
        <button
          type="button"
          className={styles.actionButton}
          onClick={() => {
            toast.action?.onClick();
            onDismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}

      {toast.dismissible !== false && (
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss notification"
          className={styles.dismissButton}
        >
          <X size={13} weight="bold" />
        </button>
      )}

      {showProgress && !reduceMotion && (
        <span
          className={styles.progress}
          style={{ animationDuration: `${toast.duration ?? 0}ms` }}
          aria-hidden="true"
        />
      )}
    </motion.div>
  );
}
