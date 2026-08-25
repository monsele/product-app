"use client";

import React from "react";

export interface ChoiceOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps {
  name?: string;
  options: ChoiceOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({
  name,
  options,
  value,
  onChange,
  ariaLabel,
}) => {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel || name}
      data-name={name}
      style={{
        display: "inline-flex",
        padding: "4px",
        backgroundColor: "var(--color-surface-subtle)",
        borderRadius: "var(--radius-control)",
        border: "1px solid var(--color-border)",
        gap: "4px",
      }}
    >
      {options.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            style={{
              padding: "6px 14px",
              fontSize: "13px",
              fontWeight: isSelected ? 600 : 400,
              color: isSelected ? "var(--color-text)" : "var(--color-text-muted)",
              backgroundColor: isSelected ? "var(--color-surface-raised)" : "transparent",
              borderRadius: "calc(var(--radius-control) - 2px)",
              border: isSelected ? "1px solid var(--color-border)" : "1px solid transparent",
              boxShadow: isSelected ? "var(--shadow-elevation)" : "none",
              cursor: opt.disabled ? "not-allowed" : "pointer",
              transition: "all var(--motion-quick) var(--motion-easing)",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
  ...props
}) => {
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "flex-start",
        gap: "10px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        style={{
          width: "18px",
          height: "18px",
          marginTop: "2px",
          accentColor: "var(--color-brand)",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
        {...props}
      />
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text)" }}>
          {label}
        </span>
        {description && (
          <span style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>
            {description}
          </span>
        )}
      </div>
    </label>
  );
};
