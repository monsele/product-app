import React from "react";
import { AppShell } from "../../../components/layout/app-shell";
import { PageLoading } from "../../../components/brand/onion-skin-loader";

/*
 * Route loading state for every lesson stage. The pipeline rail is left out
 * rather than filled with guessed stage statuses; it returns with real data.
 */
export default function WorkspaceStageLoading(): React.JSX.Element {
  return (
    <AppShell mode="daylight">
      <PageLoading message="Opening your lesson…" />
    </AppShell>
  );
}
