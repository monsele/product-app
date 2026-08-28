"use client";

import React from "react";
import { List } from "@phosphor-icons/react";
import { IconButton } from "../ui/icon-button";
import styles from "./app-header.module.css";

export interface AppHeaderProps {
  projectTitle?: string | undefined;
  projectStatus?: React.ReactNode | undefined;
  userEmail?: string | undefined;
  onSignOut?: (() => void) | undefined;
  actions?: React.ReactNode | undefined;
  onToggleMobileMenu?: (() => void) | undefined;
  isMobileMenuOpen?: boolean | undefined;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  projectTitle,
  projectStatus,
  userEmail,
  onSignOut,
  actions,
  onToggleMobileMenu,
  isMobileMenuOpen = false,
}) => {
  return (
    <header className={styles.header}>
      <div className={styles.brandGroup}>
        {onToggleMobileMenu && (
          <IconButton
            aria-label="Open project pipeline menu"
            aria-expanded={isMobileMenuOpen}
            icon={<List weight="bold" />}
            variant="tertiary"
            size="compact"
            onClick={onToggleMobileMenu}
            className="mobile-pipeline-toggle"
          />
        )}
        <span className={styles.brand}>AI Visual Learning Platform</span>
      </div>

      {projectTitle && (
        <div className={styles.projectGroup}>
          <span className={styles.projectTitle}>{projectTitle}</span>
          {projectStatus}
        </div>
      )}

      <div className={styles.accountGroup}>
        {actions}
        {userEmail && <span className={styles.userEmail}>{userEmail}</span>}
        {onSignOut && (
          <button type="button" onClick={onSignOut} className={styles.signOut}>
            Sign out
          </button>
        )}
      </div>
    </header>
  );
};
