"use client";
import React, { useId } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { IconButton } from "./icon-button";
import { X } from "@phosphor-icons/react";
import { useModalFocus } from "./use-modal-focus";
import styles from "./overlay.module.css";
export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}
export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = "520px",
}) => {
  const id = useId();
  const reduced = useReducedMotion();
  const panelRef = useModalFocus(isOpen, onClose);
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={styles.backdrop}
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
            aria-describedby={description ? `${id}-description` : undefined}
            className={styles.panel}
            style={{ maxWidth }}
            initial={{
              opacity: 0,
              scale: reduced ? 1 : 0.97,
              y: reduced ? 0 : 8,
            }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: reduced ? 1 : 0.97, y: reduced ? 0 : 8 }}
            transition={
              reduced
                ? { duration: 0.12 }
                : { type: "spring", bounce: 0, visualDuration: 0.25 }
            }
          >
            <div className={styles.header}>
              <div>
                <h2 id={`${id}-title`} className={styles.title}>
                  {title}
                </h2>
                {description && (
                  <p id={`${id}-description`} className={styles.description}>
                    {description}
                  </p>
                )}
              </div>
              <IconButton
                aria-label="Close dialog"
                icon={<X />}
                variant="tertiary"
                size="compact"
                onClick={onClose}
              />
            </div>
            {children && <div className={styles.body}>{children}</div>}
            {footer && <div className={styles.footer}>{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
