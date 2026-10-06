"use client";
import { useEffect, useRef, type RefObject } from "react";

// Shared by dialogs and drawers: opening a task moves focus into it, keeps
// keyboard navigation inside it, and returns focus to the invoking control.
let openModals = 0;
let previousOverflow = "";
export function useModalFocus(
  isOpen: boolean,
  onClose: () => void,
): RefObject<HTMLDivElement | null> {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!isOpen) return;
    const trigger =
      document.activeElement instanceof window.HTMLElement
        ? document.activeElement
        : null;
    const panel = panelRef.current;
    if (openModals++ === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    const focusable = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter(
        (element) =>
          element.getClientRects().length > 0 &&
          !element.closest('[inert], [aria-hidden="true"]'),
      );
    (focusable()[0] ?? panel)?.focus();
    const keepFocus = (event: FocusEvent) => {
      if (
        event.target instanceof window.Node &&
        panel &&
        !panel.contains(event.target)
      )
        (focusable()[0] ?? panel).focus();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) {
        event.preventDefault();
        panel?.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === panel)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || document.activeElement === panel)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("focusin", keepFocus);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("focusin", keepFocus);
      if (--openModals === 0) document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus();
    };
  }, [isOpen]);
  return panelRef;
}
