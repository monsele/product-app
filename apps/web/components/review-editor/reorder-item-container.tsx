"use client";

import React, { useRef, useEffect } from "react";
import { ArrowUp, ArrowDown, DotsSixVertical } from "@phosphor-icons/react";
import { IconButton } from "../ui/icon-button";

export interface ReorderItemContainerProps {
  id: string;
  index: number;
  totalItems: number;
  isFirst: boolean;
  isLast: boolean;
  disabled?: boolean;
  isDragging?: boolean;
  children: React.ReactNode;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  lastMovedId?: string | null;
  lastMovedDirection?: -1 | 1 | null;
  "data-testid"?: string;
}

export const ReorderItemContainer: React.FC<ReorderItemContainerProps> = ({
  id,
  index,
  totalItems,
  isFirst,
  isLast,
  disabled = false,
  isDragging = false,
  children,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  lastMovedId,
  lastMovedDirection,
  "data-testid": dataTestId,
}) => {
  const containerRef = useRef<HTMLLIElement | null>(null);
  const upButtonRef = useRef<HTMLButtonElement | null>(null);
  const downButtonRef = useRef<HTMLButtonElement | null>(null);

  // Restore focus to the moved item's relevant directional button after reordering
  useEffect(() => {
    if (lastMovedId === id) {
      if (lastMovedDirection === -1 && upButtonRef.current && !upButtonRef.current.disabled) {
        upButtonRef.current.focus();
      } else if (lastMovedDirection === 1 && downButtonRef.current && !downButtonRef.current.disabled) {
        downButtonRef.current.focus();
      } else if (containerRef.current) {
        containerRef.current.focus();
      }
    }
  }, [lastMovedId, lastMovedDirection, id]);

  return (
    <li
      ref={containerRef}
      id={`order-item-${id}`}
      tabIndex={-1}
      data-testid={dataTestId ?? `order-item-${id}`}
      draggable={!disabled && Boolean(onDragStart)}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        padding: "16px 0",
        borderBottom: index < totalItems - 1 ? "1px solid var(--color-border)" : "none",
        opacity: isDragging ? 0.4 : 1,
        transition: "opacity var(--motion-quick) var(--motion-easing)",
        outline: "none",
      }}
    >
      {/* Reorder Grip & Controls */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "2px",
          paddingTop: "4px",
          flexShrink: 0,
        }}
      >
        <div
          title="Drag to reorder"
          aria-hidden="true"
          style={{
            cursor: disabled ? "default" : "grab",
            color: "var(--color-text-muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2px",
          }}
        >
          <DotsSixVertical size={18} weight="bold" />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <IconButton
            ref={upButtonRef}
            aria-label={`Move item ${index + 1} up`}
            icon={<ArrowUp size={14} weight="bold" />}
            size="compact"
            variant="tertiary"
            disabled={disabled || isFirst}
            onClick={onMoveUp}
          />
          <IconButton
            ref={downButtonRef}
            aria-label={`Move item ${index + 1} down`}
            icon={<ArrowDown size={14} weight="bold" />}
            size="compact"
            variant="tertiary"
            disabled={disabled || isLast}
            onClick={onMoveDown}
          />
        </div>
      </div>

      {/* Main Item Content Area */}
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </li>
  );
};
