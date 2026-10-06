"use client";
import React, { useId } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { IconButton } from "./icon-button";
import { X } from "@phosphor-icons/react";
import { useModalFocus } from "./use-modal-focus";
import styles from "./overlay.module.css";
export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  position?: "right" | "left";
  width?: string;
}
export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  children,
  position = "right",
  width = "360px",
}) => {
  const id = useId();
  const reduced = useReducedMotion();
  const panelRef = useModalFocus(isOpen, onClose);
  const offset = reduced ? 0 : position === "right" ? "100%" : "-100%";
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={`${styles.backdrop} ${styles.drawerBackdrop}`}
          style={{
            justifyContent: position === "right" ? "flex-end" : "flex-start",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-title`}
            className={`${styles.panel} ${styles.drawer}`}
            style={{ maxWidth: width }}
            initial={{ x: offset }}
            animate={{ x: 0 }}
            exit={{ x: offset }}
            transition={
              reduced
                ? { duration: 0.12 }
                : { type: "spring", bounce: 0, visualDuration: 0.3 }
            }
          >
            <div className={styles.header}>
              <h2 id={`${id}-title`} className={styles.title}>
                {title}
              </h2>
              <IconButton
                aria-label="Close drawer"
                icon={<X />}
                variant="tertiary"
                size="compact"
                onClick={onClose}
              />
            </div>
            <div className={styles.body}>{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
