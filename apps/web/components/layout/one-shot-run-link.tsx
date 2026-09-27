"use client";

/**
 * ST-106 — "Prompt-to-video run" link in the wizard header. It appears only on
 * a project's wizard pages, and only when the project has a run the signed-in
 * user can see, so a user who refined a run in the editor can get back to it.
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  fetchOneShot,
  oneShotRunPath,
  wizardProjectIdFromPath,
} from "../../lib/one-shot";
import styles from "./one-shot-run-link.module.css";

export function OneShotRunLink() {
  const projectId = wizardProjectIdFromPath(usePathname());
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    setHasRun(false);
    if (projectId === null) return;
    let cancelled = false;
    fetchOneShot(projectId)
      .then((response) => {
        if (!cancelled)
          setHasRun(response.eligibility.visible && response.run !== null);
      })
      .catch(() => {
        // No link is the safe default.
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (projectId === null || !hasRun) return null;
  return (
    <Link
      href={oneShotRunPath(projectId)}
      className={styles.link}
      aria-label="Prompt-to-video run"
      data-testid="one-shot-run-link"
    >
      <span className={styles.full}>Prompt-to-video run</span>
      <span className={styles.short} aria-hidden="true">
        Video run
      </span>
    </Link>
  );
}
