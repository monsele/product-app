"use client";

import React, { useEffect, useState, useRef, useTransition, useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { CircleNotch } from "@phosphor-icons/react";
import styles from "./navigation-progress-bar.module.css";

export function NavigationProgressBar(): React.JSX.Element | null {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState<number | null>(null);
  const [showBadge, setShowBadge] = useState(false);
  const [, startTransition] = useTransition();

  const timerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const badgeTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);
  const previousRouteRef = useRef<string>(`${pathname}?${searchParams.toString()}`);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      globalThis.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (badgeTimerRef.current) {
      globalThis.clearTimeout(badgeTimerRef.current);
      badgeTimerRef.current = null;
    }
    if (intervalRef.current) {
      globalThis.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startProgress = useCallback(() => {
    clearTimers();
    setProgress(15);
    setShowBadge(false);

    // Show badge only if the transition takes longer than 200ms
    badgeTimerRef.current = globalThis.setTimeout(() => {
      setShowBadge(true);
    }, 200);

    // Incrementally advance progress towards 85%
    intervalRef.current = globalThis.setInterval(() => {
      setProgress((prev) => {
        if (prev === null) return 20;
        if (prev >= 85) return prev;
        const diff = (88 - prev) * 0.2;
        return Math.min(88, prev + diff);
      });
    }, 120);
  }, [clearTimers]);

  const completeProgress = useCallback(() => {
    clearTimers();
    setProgress(100);
    setShowBadge(false);

    timerRef.current = globalThis.setTimeout(() => {
      startTransition(() => {
        setProgress(null);
      });
    }, 250);
  }, [clearTimers]);

  // When pathname or searchParams changes, mark progress complete
  useEffect(() => {
    const currentRoute = `${pathname}?${searchParams.toString()}`;
    if (previousRouteRef.current !== currentRoute) {
      previousRouteRef.current = currentRoute;
      completeProgress();
    }
  }, [pathname, searchParams, completeProgress]);

  // Intercept click on internal links to start progress immediately
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // Find closest anchor tag
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a") as HTMLAnchorElement | null;

      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;

      // Ignore external, target=_blank, download, hash-only, or modifier clicks
      if (
        anchor.target === "_blank" ||
        anchor.hasAttribute("download") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("#") ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }

      // Check if it is an internal navigation
      try {
        const targetUrl = new URL(anchor.href, window.location.href);
        const currentUrl = new URL(window.location.href);

        // Same URL including hash -> ignore
        if (targetUrl.href === currentUrl.href) return;

        // Same origin internal route -> start loading feedback
        if (targetUrl.origin === currentUrl.origin) {
          startProgress();
        }
      } catch {
        // Not a valid URL
      }
    };

    window.addEventListener("click", handleClick, { capture: true });
    return () => {
      window.removeEventListener("click", handleClick, { capture: true });
      clearTimers();
    };
  }, [startProgress, clearTimers]);

  if (progress === null) return null;

  return (
    <>
      <div className={styles.progressBarContainer} aria-hidden="true">
        <div
          className={styles.progressBar}
          style={{
            width: `${progress}%`,
            opacity: progress === 100 ? 0 : 1,
          }}
        />
      </div>

      {showBadge && (
        <div className={styles.loadingBadge} role="status" aria-live="polite">
          <span className={styles.spinner}>
            <CircleNotch size={14} weight="bold" />
          </span>
          <span>Loading page…</span>
        </div>
      )}
    </>
  );
}
