"use client";

import React from "react";
import {
  CheckCircle,
  XCircle,
  Warning,
  Info,
  X,
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import styles from "./toast.module.css";

export type ToastType = "success" | "error" | "warning" | "info";

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
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const reduceMotion = useReducedMotion();

  const getIcon = () => {
    switch (toast.type) {
      case "success":
        return <CheckCircle size={18} weight="fill" />;
      case "error":
        return <XCircle size={18} weight="fill" />;
      case "warning":
        return <Warning size={18} weight="fill" />;
      case "info":
        return <Info size={18} weight="fill" />;
    }
  };

  const getIconClass = () => {
    switch (toast.type) {
      case "success":
        return styles.successIcon;
      case "error":
        return styles.errorIcon;
      case "warning":
        return styles.warningIcon;
      case "info":
        return styles.infoIcon;
    }
  };

  const isAlert = toast.type === "error";

  return (
    <motion.div
      layout={!reduceMotion}
      initial={
        reduceMotion
          ? { opacity: 0 }
          : { opacity: 0, y: 16, scale: 0.96 }
      }
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={
        reduceMotion
          ? { opacity: 0 }
          : { opacity: 0, y: 12, scale: 0.94 }
      }
      transition={{
        duration: 0.24,
        ease: [0.16, 1, 0.3, 1],
      }}
      role={isAlert ? "alert" : "status"}
      aria-live={isAlert ? "assertive" : "polite"}
      aria-atomic="true"
      className={`${styles.toast} ui-toast ui-toast-${toast.type}`}
      data-testid={`toast-${toast.type}`}
    >
      <div className={`${styles.iconWrapper} ${getIconClass()}`}>
        {getIcon()}
      </div>

      <div className={styles.content}>
        {toast.title && <span className={styles.title}>{toast.title}</span>}
        <div className={styles.message}>{toast.message}</div>
        {toast.action && (
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
      </div>

      {toast.dismissible !== false && (
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          aria-label="Dismiss notification"
          className={styles.dismissButton}
        >
          <X size={14} weight="bold" />
        </button>
      )}
    </motion.div>
  );
}
