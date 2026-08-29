"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence } from "motion/react";
import { Toast, type ToastAction, type ToastItem, type ToastType } from "./toast";
import styles from "./toast.module.css";

export interface ToastOptions {
  title?: string | undefined;
  duration?: number | undefined;
  action?: ToastAction | undefined;
  dismissible?: boolean | undefined;
}

export interface ToastContextValue {
  toasts: ToastItem[];
  addToast: (
    type: ToastType,
    message: React.ReactNode,
    options?: ToastOptions,
  ) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
  success: (message: React.ReactNode, options?: ToastOptions) => string;
  error: (message: React.ReactNode, options?: ToastOptions) => string;
  warning: (message: React.ReactNode, options?: ToastOptions) => string;
  info: (message: React.ReactNode, options?: ToastOptions) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

type ToastListener = (
  type: ToastType,
  message: React.ReactNode,
  options?: ToastOptions,
) => string;
type DismissListener = (id?: string) => void;

let globalAddToast: ToastListener | null = null;
let globalDismissToast: DismissListener | null = null;

/**
 * Direct imperative toast caller for components or utility functions.
 */
export const toast = {
  success: (message: React.ReactNode, options?: ToastOptions): string => {
    return globalAddToast ? globalAddToast("success", message, options) : "";
  },
  error: (message: React.ReactNode, options?: ToastOptions): string => {
    return globalAddToast ? globalAddToast("error", message, options) : "";
  },
  warning: (message: React.ReactNode, options?: ToastOptions): string => {
    return globalAddToast ? globalAddToast("warning", message, options) : "";
  },
  info: (message: React.ReactNode, options?: ToastOptions): string => {
    return globalAddToast ? globalAddToast("info", message, options) : "";
  },
  dismiss: (id?: string): void => {
    globalDismissToast?.(id);
  },
};

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    // Return a safe fallback that routes to global toast
    return {
      toasts: [],
      addToast: (type, message, options) => {
        if (type === "success") return toast.success(message, options);
        if (type === "error") return toast.error(message, options);
        if (type === "warning") return toast.warning(message, options);
        return toast.info(message, options);
      },
      removeToast: (id) => toast.dismiss(id),
      clearToasts: () => toast.dismiss(),
      success: (msg, opts) => toast.success(msg, opts),
      error: (msg, opts) => toast.error(msg, opts),
      warning: (msg, opts) => toast.warning(msg, opts),
      info: (msg, opts) => toast.info(msg, opts),
    };
  }
  return context;
}

function getDefaultDuration(type: ToastType): number {
  switch (type) {
    case "error":
      return 8000;
    case "warning":
      return 6000;
    case "success":
    case "info":
    default:
      return 4500;
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof globalThis.setTimeout>>>(
    new Map(),
  );

  const removeToast = useCallback((id: string) => {
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      globalThis.clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    for (const timeout of timeoutsRef.current.values()) {
      globalThis.clearTimeout(timeout);
    }
    timeoutsRef.current.clear();
    setToasts([]);
  }, []);

  const addToast = useCallback(
    (
      type: ToastType,
      message: React.ReactNode,
      options?: ToastOptions,
    ): string => {
      const id =
        typeof globalThis.crypto !== "undefined" && globalThis.crypto.randomUUID
          ? globalThis.crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      const duration =
        options?.duration !== undefined
          ? options.duration
          : getDefaultDuration(type);

      const newItem: ToastItem = {
        id,
        type,
        message,
        title: options?.title,
        duration,
        action: options?.action,
        dismissible: options?.dismissible !== false,
      };

      setToasts((current) => {
        // Cap maximum simultaneous toasts to 5 to avoid screen clutter
        const next = [...current, newItem];
        if (next.length > 5) {
          const removed = next.shift();
          if (removed) {
            const timeout = timeoutsRef.current.get(removed.id);
            if (timeout) {
              globalThis.clearTimeout(timeout);
              timeoutsRef.current.delete(removed.id);
            }
          }
        }
        return next;
      });

      if (duration > 0) {
        const timeout = globalThis.setTimeout(() => {
          removeToast(id);
        }, duration);
        timeoutsRef.current.set(id, timeout);
      }

      return id;
    },
    [removeToast],
  );

  const success = useCallback(
    (message: React.ReactNode, options?: ToastOptions) =>
      addToast("success", message, options),
    [addToast],
  );

  const error = useCallback(
    (message: React.ReactNode, options?: ToastOptions) =>
      addToast("error", message, options),
    [addToast],
  );

  const warning = useCallback(
    (message: React.ReactNode, options?: ToastOptions) =>
      addToast("warning", message, options),
    [addToast],
  );

  const info = useCallback(
    (message: React.ReactNode, options?: ToastOptions) =>
      addToast("info", message, options),
    [addToast],
  );

  useEffect(() => {
    globalAddToast = addToast;
    globalDismissToast = (id) => {
      if (id) removeToast(id);
      else clearToasts();
    };

    return () => {
      globalAddToast = null;
      globalDismissToast = null;
    };
  }, [addToast, removeToast, clearToasts]);

  // Clean up timeouts on unmount
  useEffect(() => {
    const timeouts = timeoutsRef.current;
    return () => {
      for (const timeout of timeouts.values()) {
        globalThis.clearTimeout(timeout);
      }
      timeouts.clear();
    };
  }, []);

  const value: ToastContextValue = {
    toasts,
    addToast,
    removeToast,
    clearToasts,
    success,
    error,
    warning,
    info,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className={styles.toastContainer}
        aria-live="polite"
        aria-atomic="false"
        role="region"
        aria-label="Notifications"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((item) => (
            <Toast key={item.id} toast={item} onDismiss={removeToast} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
