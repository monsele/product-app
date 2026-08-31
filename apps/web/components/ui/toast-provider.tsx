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

/**
 * Describes how a pending submit resolves. Each field may be a static node or a
 * function of the resolved value / thrown error.
 */
export interface ToastPromiseMessages<T> {
  loading: React.ReactNode;
  success: React.ReactNode | ((value: T) => React.ReactNode);
  error: React.ReactNode | ((error: unknown) => React.ReactNode);
  title?: string | undefined;
  successOptions?: ToastOptions | undefined;
  errorOptions?: ToastOptions | undefined;
}

export interface ToastContextValue {
  toasts: ToastItem[];
  addToast: (
    type: ToastType,
    message: React.ReactNode,
    options?: ToastOptions,
  ) => string;
  updateToast: (
    id: string,
    type: ToastType,
    message: React.ReactNode,
    options?: ToastOptions,
  ) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
  success: (message: React.ReactNode, options?: ToastOptions) => string;
  error: (message: React.ReactNode, options?: ToastOptions) => string;
  warning: (message: React.ReactNode, options?: ToastOptions) => string;
  info: (message: React.ReactNode, options?: ToastOptions) => string;
  loading: (message: React.ReactNode, options?: ToastOptions) => string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

type ToastListener = (
  type: ToastType,
  message: React.ReactNode,
  options?: ToastOptions,
) => string;
type UpdateListener = (
  id: string,
  type: ToastType,
  message: React.ReactNode,
  options?: ToastOptions,
) => void;
type DismissListener = (id?: string) => void;

let globalAddToast: ToastListener | null = null;
let globalUpdateToast: UpdateListener | null = null;
let globalDismissToast: DismissListener | null = null;

function resolveMessage<T>(
  message: React.ReactNode | ((value: T) => React.ReactNode),
  value: T,
): React.ReactNode {
  return typeof message === "function"
    ? (message as (value: T) => React.ReactNode)(value)
    : message;
}

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
  loading: (message: React.ReactNode, options?: ToastOptions): string => {
    return globalAddToast ? globalAddToast("loading", message, options) : "";
  },
  update: (
    id: string,
    type: ToastType,
    message: React.ReactNode,
    options?: ToastOptions,
  ): void => {
    globalUpdateToast?.(id, type, message, options);
  },
  dismiss: (id?: string): void => {
    globalDismissToast?.(id);
  },
  /**
   * Wraps a submit action in a single toast that starts as "in flight" and
   * morphs in place into the success or error result. One toast per action, so
   * a burst of saves never stacks into a wall of notifications.
   */
  promise: async <T,>(
    work: Promise<T> | (() => Promise<T>),
    messages: ToastPromiseMessages<T>,
  ): Promise<T> => {
    const id = toast.loading(messages.loading, { title: messages.title });
    try {
      const value = await (typeof work === "function" ? work() : work);
      const successMessage = resolveMessage(messages.success, value);
      if (id) toast.update(id, "success", successMessage, messages.successOptions);
      else toast.success(successMessage, messages.successOptions);
      return value;
    } catch (thrown) {
      const errorMessage = resolveMessage(messages.error, thrown);
      if (id) toast.update(id, "error", errorMessage, messages.errorOptions);
      else toast.error(errorMessage, messages.errorOptions);
      throw thrown;
    }
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
        if (type === "loading") return toast.loading(message, options);
        return toast.info(message, options);
      },
      updateToast: (id, type, message, options) =>
        toast.update(id, type, message, options),
      removeToast: (id) => toast.dismiss(id),
      clearToasts: () => toast.dismiss(),
      success: (msg, opts) => toast.success(msg, opts),
      error: (msg, opts) => toast.error(msg, opts),
      warning: (msg, opts) => toast.warning(msg, opts),
      info: (msg, opts) => toast.info(msg, opts),
      loading: (msg, opts) => toast.loading(msg, opts),
    };
  }
  return context;
}

export function getDefaultDuration(type: ToastType): number {
  switch (type) {
    case "loading":
      // Stays until the action it represents resolves.
      return 0;
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

interface ToastTimer {
  handle: ReturnType<typeof globalThis.setTimeout> | null;
  remaining: number;
  startedAt: number;
}

/**
 * The toast container is a sibling of the page tree, so it never inherits the
 * theme class that AppShell / EditorShell put on their own wrapper. Mirroring
 * the active theme here keeps a toast in the palette of the screen behind it.
 */
function activeThemeClass(): string {
  if (typeof globalThis.document === "undefined") return "";
  return globalThis.document.querySelector(".theme-focus-studio") === null
    ? ""
    : "theme-focus-studio";
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [themeClass, setThemeClass] = useState("");
  const timersRef = useRef<Map<string, ToastTimer>>(new Map());

  const clearTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer?.handle) globalThis.clearTimeout(timer.handle);
    timersRef.current.delete(id);
  }, []);

  const removeToast = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((current) => current.filter((item) => item.id !== id));
    },
    [clearTimer],
  );

  const clearToasts = useCallback(() => {
    for (const timer of timersRef.current.values()) {
      if (timer.handle) globalThis.clearTimeout(timer.handle);
    }
    timersRef.current.clear();
    setToasts([]);
  }, []);

  const scheduleDismissal = useCallback(
    (id: string, duration: number) => {
      clearTimer(id);
      if (duration <= 0) return;
      timersRef.current.set(id, {
        handle: globalThis.setTimeout(() => removeToast(id), duration),
        remaining: duration,
        startedAt: Date.now(),
      });
    },
    [clearTimer, removeToast],
  );

  /** Freezes the countdown while the pointer or keyboard focus rests on a toast. */
  const pauseToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (!timer?.handle) return;
    globalThis.clearTimeout(timer.handle);
    timersRef.current.set(id, {
      handle: null,
      remaining: Math.max(0, timer.remaining - (Date.now() - timer.startedAt)),
      startedAt: Date.now(),
    });
  }, []);

  const resumeToast = useCallback(
    (id: string) => {
      const timer = timersRef.current.get(id);
      if (!timer || timer.handle !== null) return;
      if (timer.remaining <= 0) {
        removeToast(id);
        return;
      }
      timersRef.current.set(id, {
        handle: globalThis.setTimeout(() => removeToast(id), timer.remaining),
        remaining: timer.remaining,
        startedAt: Date.now(),
      });
    },
    [removeToast],
  );

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

      // Re-read on each add: the user may have moved between a Daylight board
      // and a Focus Studio editor since the last toast.
      setThemeClass(activeThemeClass());

      setToasts((current) => {
        // Cap simultaneous toasts at 3 so the stack stays readable at a glance.
        const next = [...current, newItem];
        while (next.length > 3) {
          const removed = next.shift();
          if (removed) clearTimer(removed.id);
        }
        return next;
      });

      scheduleDismissal(id, duration);
      return id;
    },
    [clearTimer, scheduleDismissal],
  );

  /**
   * Swaps a live toast type and copy without unmounting it, so a pending action
   * resolves in place instead of spawning a second notification.
   */
  const updateToast = useCallback(
    (
      id: string,
      type: ToastType,
      message: React.ReactNode,
      options?: ToastOptions,
    ) => {
      const duration =
        options?.duration !== undefined
          ? options.duration
          : getDefaultDuration(type);

      let found = false;
      setToasts((current) =>
        current.map((item) => {
          if (item.id !== id) return item;
          found = true;
          return {
            ...item,
            type,
            message,
            title: options?.title,
            duration,
            action: options?.action,
            dismissible: options?.dismissible !== false,
          };
        }),
      );

      // The toast may already be gone: dismissed by hand, or pushed off the cap.
      if (!found) return;
      scheduleDismissal(id, duration);
    },
    [scheduleDismissal],
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

  const loading = useCallback(
    (message: React.ReactNode, options?: ToastOptions) =>
      addToast("loading", message, options),
    [addToast],
  );

  useEffect(() => {
    globalAddToast = addToast;
    globalUpdateToast = updateToast;
    globalDismissToast = (id) => {
      if (id) removeToast(id);
      else clearToasts();
    };

    return () => {
      globalAddToast = null;
      globalUpdateToast = null;
      globalDismissToast = null;
    };
  }, [addToast, updateToast, removeToast, clearToasts]);

  // Clean up timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        if (timer.handle) globalThis.clearTimeout(timer.handle);
      }
      timers.clear();
    };
  }, []);

  const value: ToastContextValue = {
    toasts,
    addToast,
    updateToast,
    removeToast,
    clearToasts,
    success,
    error,
    warning,
    info,
    loading,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className={`${styles.toastContainer} ${themeClass}`.trimEnd()}
        aria-live="polite"
        aria-atomic="false"
        role="region"
        aria-label="Notifications"
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((item) => (
            <Toast
              key={item.id}
              toast={item}
              onDismiss={removeToast}
              onPause={pauseToast}
              onResume={resumeToast}
            />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
