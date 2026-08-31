"use client";

import Image from "next/image";
import React, { useState, type FormEvent, type ReactNode } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  EnvelopeSimple,
  LockKey,
  Eye,
  EyeSlash,
  CheckCircle,
  WarningCircle,
  Sparkle,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
} from "@phosphor-icons/react";
import { toast } from "../components/ui/toast-provider";
import styles from "./auth.module.css";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function ForgotPasswordForm() {
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(undefined);
    setMessage(undefined);
    setIsSubmitting(true);
    const form = new FormData(event.currentTarget);
    const pendingToastId = toast.loading("Sending reset link...");

    try {
      const response = await fetch(`${apiUrl}/auth/password-reset/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email") }),
      });
      if (!response.ok) {
        const failure = "Unable to request a password reset. Please try again.";
        setError(failure);
        toast.update(pendingToastId, "error", failure);
        return;
      }
      const confirmation =
        "If an account matches that email address, we sent password reset instructions.";
      setMessage(confirmation);
      toast.update(pendingToastId, "success", "Check your inbox for the reset link.");
    } catch {
      const failure = "Unable to reach the service. Please try again.";
      setError(failure);
      toast.update(pendingToastId, "error", failure);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthRecoveryShell eyebrow="Account recovery">
      <h1>Find your way back to the studio.</h1>
      <p className={styles.intro}>
        Enter the email you use for your teacher account. We will send a secure
        reset link if there is a matching account.
      </p>
      <form className={styles.form} onSubmit={submit} aria-busy={isSubmitting}>
        <label className={styles.field}>
          <span>Email address</span>
          <div className={styles.inputWrapper}>
            <div className={styles.inputIcon}>
              <EnvelopeSimple size={18} weight="regular" />
            </div>
            <input
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="teacher@school.org"
              required
            />
          </div>
        </label>

        <AnimatePresence mode="wait">
          {message !== undefined && (
            <motion.div
              key="reset-request-msg"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={styles.success}
              role="status"
            >
              <CheckCircle size={18} weight="fill" className={styles.calloutIcon} />
              <span>{message}</span>
            </motion.div>
          )}

          {error !== undefined && (
            <motion.div
              key="reset-request-err"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={styles.error}
              role="alert"
            >
              <WarningCircle size={18} weight="fill" className={styles.calloutIcon} />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          className={styles.primaryAction}
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <span className={styles.spinner} />
              <span>Sending securely...</span>
            </>
          ) : (
            <>
              <span>Send reset link</span>
              <ArrowRight size={16} weight="bold" />
            </>
          )}
        </button>
      </form>

      <div className={styles.links}>
        <a className={styles.backLink} href="/sign-in">
          <ArrowLeft size={14} weight="bold" />
          <span>Back to sign in</span>
        </a>
      </div>
    </AuthRecoveryShell>
  );
}

export function ResetPasswordForm({ token }: { token: string | undefined }) {
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");
  const [confirmPasswordValue, setConfirmPasswordValue] = useState("");

  const isPasswordLongEnough = passwordValue.length >= 12;
  const passwordsMatch =
    confirmPasswordValue.length > 0 && passwordValue === confirmPasswordValue;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (token === undefined) {
      const invalid = "This password reset link is invalid or has expired.";
      setError(invalid);
      toast.error(invalid);
      return;
    }
    const form = new FormData(event.currentTarget);
    const password = form.get("password");
    if (password !== form.get("passwordConfirmation")) {
      setError("Passwords do not match.");
      toast.error("Passwords do not match.");
      return;
    }
    setError(undefined);
    setIsSubmitting(true);
    const pendingToastId = toast.loading("Updating your password...");
    try {
      const response = await fetch(`${apiUrl}/auth/password-reset/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!response.ok) {
        const invalid = "This password reset link is invalid or has expired.";
        setError(invalid);
        toast.update(pendingToastId, "error", invalid);
        return;
      }
      toast.update(pendingToastId, "success", "Password updated.");
      window.location.assign("/sign-in?passwordReset=1");
    } catch {
      const failure = "Unable to reach the service. Please try again.";
      setError(failure);
      toast.update(pendingToastId, "error", failure);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthRecoveryShell eyebrow="Secure your account">
      <h1>Choose a new password.</h1>
      <p className={styles.intro}>
        Use a fresh password that you do not use for another service.
      </p>
      <form className={styles.form} onSubmit={submit} aria-busy={isSubmitting}>
        <label className={styles.field}>
          <span>New password</span>
          <div className={styles.inputWrapper}>
            <div className={styles.inputIcon}>
              <LockKey size={18} weight="regular" />
            </div>
            <input
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={12}
              aria-describedby="password-requirements"
              value={passwordValue}
              onChange={(e) => setPasswordValue(e.target.value)}
              placeholder="At least 12 characters"
              required
            />
            <button
              type="button"
              className={styles.toggleVisibility}
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeSlash size={18} weight="regular" />
              ) : (
                <Eye size={18} weight="regular" />
              )}
            </button>
          </div>
        </label>

        <ul className={styles.requirements} id="password-requirements">
          <li
            className={`${styles.requirementItem} ${
              isPasswordLongEnough ? styles.requirementMet : ""
            }`}
          >
            <CheckCircle
              size={14}
              weight={isPasswordLongEnough ? "fill" : "regular"}
              className={styles.requirementIcon}
            />
            <span>At least 12 characters</span>
          </li>
          <li className={styles.requirementItem}>
            <CheckCircle size={14} weight="regular" className={styles.requirementIcon} />
            <span>Unique to this account</span>
          </li>
        </ul>

        <label className={styles.field}>
          <span>Confirm new password</span>
          <div className={styles.inputWrapper}>
            <div className={styles.inputIcon}>
              <LockKey size={18} weight="regular" />
            </div>
            <input
              name="passwordConfirmation"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              minLength={12}
              value={confirmPasswordValue}
              onChange={(e) => setConfirmPasswordValue(e.target.value)}
              placeholder="Re-enter your password"
              required
            />
            {passwordsMatch && (
              <div
                style={{
                  position: "absolute",
                  right: "0.75rem",
                  color: "var(--color-success-fg, #176b46)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <CheckCircle size={18} weight="fill" />
              </div>
            )}
          </div>
        </label>

        <AnimatePresence mode="wait">
          {error !== undefined && (
            <motion.div
              key="reset-confirm-err"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={styles.error}
              role="alert"
            >
              <WarningCircle size={18} weight="fill" className={styles.calloutIcon} />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          className={styles.primaryAction}
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <>
              <span className={styles.spinner} />
              <span>Updating securely...</span>
            </>
          ) : (
            <>
              <span>Update password</span>
              <ArrowRight size={16} weight="bold" />
            </>
          )}
        </button>
      </form>

      <div className={styles.links}>
        <a className={styles.backLink} href="/sign-in">
          <ArrowLeft size={14} weight="bold" />
          <span>Back to sign in</span>
        </a>
      </div>
    </AuthRecoveryShell>
  );
}

function AuthRecoveryShell({
  children,
  eyebrow,
}: {
  children: ReactNode;
  eyebrow: string;
}) {
  return (
    <main className={styles.page}>
      <section className={styles.reassurance} aria-label="Studio Daylight">
        <div className={styles.brandGroup}>
          <div className={styles.brandHeader}>
            <div className={styles.brandIcon}>
              <Sparkle size={20} weight="fill" />
            </div>
            <div className={styles.brand}>Studio Daylight</div>
          </div>
          <div className={styles.studioBadge}>
            <span className={styles.studioBadgeDot} />
            AI Visual Learning Platform
          </div>
        </div>

        <div className={styles.artFrameContainer}>
          <motion.div
            className={styles.artFrame}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            <Image
              src="/catalog/plant-cycle.svg"
              alt="A calm plant life-cycle learning illustration"
              fill
              priority
              sizes="(max-width: 760px) 88vw, 42vw"
              style={{ pointerEvents: "none" }}
            />
          </motion.div>
        </div>

        <div className={styles.reassuranceFooter}>
          <p>
            Your lesson work stays in place while you recover access to your
            teaching studio.
          </p>
          <div className={styles.pillFeatureRow}>
            <div className={styles.featurePill}>
              <ShieldCheck size={14} className={styles.featurePillIcon} weight="bold" />
              Encrypted Auth
            </div>
            <div className={styles.featurePill}>
              <Sparkle size={14} className={styles.featurePillIcon} weight="fill" />
              Continuous Session
            </div>
          </div>
        </div>
      </section>

      <section className={styles.formPanel}>
        <motion.div
          className={styles.formContent}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <div className={styles.eyebrow}>
            <Sparkle size={14} weight="fill" />
            {eyebrow}
          </div>
          {children}
        </motion.div>
      </section>
    </main>
  );
}
