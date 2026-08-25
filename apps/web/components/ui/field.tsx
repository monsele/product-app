"use client";

import React from "react";

export interface FieldProps {
  id?: string;
  label?: string;
  helperText?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  isFieldset?: boolean;
  legend?: string;
  className?: string;
}

export const Field: React.FC<FieldProps> = ({
  id,
  label,
  helperText,
  error,
  required = false,
  children,
  isFieldset = false,
  legend,
  className = "",
}) => {
  const Container = isFieldset ? "fieldset" : "div";

  const containerStyles: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    width: "100%",
    border: "none",
    padding: 0,
    margin: 0,
  };

  const labelStyles: React.CSSProperties = {
    fontSize: "14px",
    fontWeight: 500,
    color: "var(--color-text)",
    display: "flex",
    alignItems: "center",
    gap: "4px",
  };

  const helperStyles: React.CSSProperties = {
    fontSize: "13px",
    color: "var(--color-text-muted)",
    lineHeight: "18px",
  };

  const errorStyles: React.CSSProperties = {
    fontSize: "13px",
    color: "var(--color-error-fg)",
    fontWeight: 500,
    lineHeight: "18px",
  };

  return (
    <Container style={containerStyles} className={`ui-field ${className}`}>
      {isFieldset ? (
        legend && (
          <legend style={labelStyles}>
            {legend}
            {required && <span style={{ color: "var(--color-error-fg)" }}>*</span>}
          </legend>
        )
      ) : (
        label && (
          <label htmlFor={id} style={labelStyles}>
            {label}
            {required && <span style={{ color: "var(--color-error-fg)" }}>*</span>}
          </label>
        )
      )}

      {children}

      {error ? (
        <span id={id ? `${id}-error` : undefined} style={errorStyles} role="alert">
          {error}
        </span>
      ) : helperText ? (
        <span id={id ? `${id}-helper` : undefined} style={helperStyles}>
          {helperText}
        </span>
      ) : null}
    </Container>
  );
};
