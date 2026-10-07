import React from "react";
import { AuthenticatedAppShell } from "../../components/layout/authenticated-app-shell";
import { PageLoading } from "../../components/brand/onion-skin-loader";
import styles from "./workspace.module.css";

/*
 * Route loading state. It shows only what is certain (the page title) and the
 * Onion Skin loader; no placeholder account or lesson data.
 */
export default function WorkspaceLoading(): React.JSX.Element {
  return (
    <AuthenticatedAppShell mode="daylight">
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.pageTitle}>Your lessons</h1>
        </header>
        <PageLoading message="Loading your lessons…" />
      </div>
    </AuthenticatedAppShell>
  );
}
