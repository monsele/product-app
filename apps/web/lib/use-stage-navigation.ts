"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startNavigationProgress } from "../components/layout/navigation-progress-bar";

export interface StageNavigation {
  /** Navigate to a workspace route, holding a pending state until it renders. */
  navigate: (href: string) => void;
  /** True while any navigation started by this hook is still in flight. */
  isNavigating: boolean;
  /** The in-flight target, so one of several buttons can show the spinner. */
  pendingHref: string | null;
}

/**
 * Route changes between workspace stages fetch a fresh RSC payload, which on
 * the heavier stages takes long enough that a bare `router.push` looks like a
 * dead button. This wraps the push in a transition so callers get a real
 * pending flag, and pings the global progress bar, which on its own only
 * notices anchor clicks.
 */
export function useStageNavigation(): StageNavigation {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  const navigate = useCallback(
    (href: string) => {
      if (isNavigating) return;
      setPendingHref(href);
      startNavigationProgress();
      startNavigation(() => {
        router.push(href);
      });
    },
    [isNavigating, router],
  );

  return {
    navigate,
    isNavigating,
    pendingHref: isNavigating ? pendingHref : null,
  };
}
