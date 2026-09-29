"use client";

/**
 * Wizard header link back to the workspace lesson list, so a user partway
 * through the pipeline can return to their projects from any stage.
 */

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";
import styles from "./one-shot-run-link.module.css";

export function WorkspaceHomeLink() {
  return (
    <Link
      href="/workspace"
      className={styles.link}
      aria-label="Back to all lessons"
      data-testid="workspace-home-link"
    >
      <ArrowLeft weight="bold" aria-hidden="true" style={{ marginRight: 6 }} />
      <span className={styles.full}>All lessons</span>
      <span className={styles.short} aria-hidden="true">
        Lessons
      </span>
    </Link>
  );
}
