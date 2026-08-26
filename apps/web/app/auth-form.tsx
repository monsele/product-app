"use client";

import Image from "next/image";
import React, { useState, type FormEvent } from "react";
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
  const title = mode === "register" ? "Create your account" : "Sign in";

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(undefined);
    setIsSubmitting(true);

    const form = new FormData(event.currentTarget);
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
        setError(body?.error?.message ?? "Unable to continue.");
        return;
      }
      window.location.assign("/workspace");
    } catch {
      setError("Unable to reach the service. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.reassurance} aria-label="Studio Daylight">
        <div className={styles.brand}>Studio Daylight</div>
        <div className={styles.artFrame}>
          <Image
            src="/catalog/plant-cycle.svg"
            alt="A calm plant life-cycle learning illustration"
            fill
            priority
            sizes="(max-width: 760px) 88vw, 42vw"
            style={{ pointerEvents: "none" }}
          />
        </div>
        <p>
          {mode === "register"
            ? "Turn teaching material into editable, teachable visual lessons."
            : "Your visual lessons are ready to edit and share with your learners."}
        </p>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.formContent}>
          <p className={styles.eyebrow}>
            {mode === "register" ? "Create account" : "Welcome back"}
          </p>
          <h1>{title}</h1>
          <p className={styles.intro}>
            {mode === "register"
              ? "Register your teacher account to start authoring visual lessons."
              : "Sign in to access your teacher workspace and project pipeline."}
          </p>

          {passwordResetSuccess && (
            <p className={styles.success} role="status">
              Your password has been updated. Please sign in with your new
              password.
            </p>
          )}

          <form
            className={styles.form}
            onSubmit={submit}
            aria-busy={isSubmitting}
          >
            <label className={styles.field}>
              <span>Email</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
              />
            </label>

            <label className={styles.field}>
              <span>Password</span>
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                minLength={mode === "register" ? 12 : undefined}
                aria-describedby={
                  mode === "register" ? "password-requirements" : undefined
                }
                required
              />
            </label>

            {mode === "register" ? (
              <ul className={styles.requirements} id="password-requirements">
                <li>At least 12 characters</li>
                <li>Unique to this account</li>
              </ul>
            ) : null}

            {error === undefined ? null : (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            <button
              className={styles.primaryAction}
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? mode === "register"
                  ? "Creating account..."
                  : "Signing in..."
                : title}
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
        </div>
      </section>
    </main>
  );
}
