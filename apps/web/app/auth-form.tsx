"use client";

import Image from "next/image";
import React, { useState, type FormEvent } from "react";
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
  ShieldCheck,
} from "@phosphor-icons/react";
import { toast } from "../components/ui/toast-provider";
import styles from "./auth.module.css";

type AuthMode = "register" | "login";
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function AuthForm({
  mode,
  passwordResetSuccess = false,
}: {
  mode: AuthMode;
  passwordResetSuccess?: boolean;
}) {
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordValue, setPasswordValue] = useState("");
  const title = mode === "register" ? "Create your account" : "Sign in";

  const isPasswordLongEnough = passwordValue.length >= 12;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(undefined);
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);
    const pendingToastId = toast.loading(
      mode === "register" ? "Creating your account..." : "Signing you in...",
    );

    try {
      const response = await fetch(
        `${apiUrl}/auth/${mode === "register" ? "register" : "login"}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: form.get("email"),
            password: form.get("password"),
          }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        const message = body?.error?.message ?? "Unable to continue.";
        setError(message);
        toast.update(pendingToastId, "error", message);
        return;
      }
      toast.update(
        pendingToastId,
        "success",
        mode === "register"
          ? "Account created. Opening your workspace."
          : "Signed in. Opening your workspace.",
      );
      window.location.assign("/workspace");
    } catch {
      const message = "Unable to reach the service. Please try again.";
      setError(message);
      toast.update(pendingToastId, "error", message);
    } finally {
      setIsSubmitting(false);
    }
  }

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
            {mode === "register"
              ? "Turn raw curriculum documents into editable, teachable visual lessons."
              : "Your visual lessons are ready to edit and share with your learners."}
          </p>
          <div className={styles.pillFeatureRow}>
            <div className={styles.featurePill}>
              <ShieldCheck size={14} className={styles.featurePillIcon} weight="bold" />
              Isolated Workspace
            </div>
            <div className={styles.featurePill}>
              <Sparkle size={14} className={styles.featurePillIcon} weight="fill" />
              Pedagogical Engine
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
            {mode === "register" ? "Create account" : "Welcome back"}
          </div>
          <h1>{title}</h1>
          <p className={styles.intro}>
            {mode === "register"
              ? "Register your teacher account to start authoring visual lessons."
              : "Sign in to access your teacher workspace and project pipeline."}
          </p>

          <AnimatePresence mode="wait">
            {passwordResetSuccess && (
              <motion.div
                key="reset-success"
                initial={{ opacity: 0, height: 0, y: -8 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className={styles.success}
                role="status"
              >
                <CheckCircle size={18} weight="fill" className={styles.calloutIcon} />
                <span>
                  Your password has been updated. Please sign in with your new password.
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <form
            className={styles.form}
            onSubmit={submit}
            aria-busy={isSubmitting}
          >
            <label className={styles.field}>
              <span>Email</span>
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

            <label className={styles.field}>
              <span>Password</span>
              <div className={styles.inputWrapper}>
                <div className={styles.inputIcon}>
                  <LockKey size={18} weight="regular" />
                </div>
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                  minLength={mode === "register" ? 12 : undefined}
                  aria-describedby={
                    mode === "register" ? "password-requirements" : undefined
                  }
                  value={passwordValue}
                  onChange={(e) => setPasswordValue(e.target.value)}
                  placeholder={mode === "register" ? "At least 12 characters" : "••••••••••••"}
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

            {mode === "register" ? (
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
            ) : null}

            <AnimatePresence mode="wait">
              {error !== undefined && (
                <motion.div
                  key="form-error"
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
                  <span>{mode === "register" ? "Creating account..." : "Signing in..."}</span>
                </>
              ) : (
                <>
                  <span>{title}</span>
                  <ArrowRight size={16} weight="bold" />
                </>
              )}
            </button>
          </form>

          <div className={styles.links}>
            {mode === "login" ? (
              <>
                <a className={styles.backLink} href="/forgot-password">
                  Forgot password?
                </a>
                <a className={styles.backLink} href="/register">
                  Need an account? Create one here
                </a>
              </>
            ) : (
              <a className={styles.backLink} href="/sign-in">
                Already have an account? Sign in
              </a>
            )}
          </div>
        </motion.div>
      </section>
    </main>
  );
}
