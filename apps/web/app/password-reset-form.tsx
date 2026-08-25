"use client";

import Image from "next/image";
import { useState, type FormEvent, type ReactNode } from "react";
import styles from "./password-reset.module.css";

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
    try {
      const response = await fetch(`${apiUrl}/auth/password-reset/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email") }),
      });
      if (!response.ok) {
        setError("Unable to request a password reset. Please try again.");
        return;
      }
      setMessage(
        "If an account matches that email address, we sent password reset instructions.",
      );
    } catch {
      setError("Unable to reach the service. Please try again.");
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
          <input
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="teacher@school.org"
            required
          />
        </label>
        <button
          className={styles.primaryAction}
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Sending securely..." : "Send reset link"}
        </button>
      </form>
      {message === undefined ? null : (
        <p className={styles.success} role="status">
          {message}
        </p>
      )}
      {error === undefined ? null : (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <a className={styles.backLink} href="/sign-in">
        Back to sign in
      </a>
    </AuthRecoveryShell>
  );
}

export function ResetPasswordForm({ token }: { token: string | undefined }) {
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (token === undefined) {
      setError("This password reset link is invalid or has expired.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const password = form.get("password");
    if (password !== form.get("passwordConfirmation")) {
      setError("Passwords do not match.");
      return;
    }
    setError(undefined);
    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/auth/password-reset/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!response.ok) {
        setError("This password reset link is invalid or has expired.");
        return;
      }
      window.location.assign("/sign-in?passwordReset=1");
    } catch {
      setError("Unable to reach the service. Please try again.");
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
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            aria-describedby="password-requirements"
            required
          />
        </label>
        <ul className={styles.requirements} id="password-requirements">
          <li>At least 12 characters</li>
          <li>Unique to this account</li>
        </ul>
        <label className={styles.field}>
          <span>Confirm new password</span>
          <input
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
        </label>
        <button
          className={styles.primaryAction}
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Updating securely..." : "Update password"}
        </button>
      </form>
      {error === undefined ? null : (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <a className={styles.backLink} href="/sign-in">
        Back to sign in
      </a>
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
        <div className={styles.brand}>Studio Daylight</div>
        <div className={styles.artFrame}>
          <Image
            src="/catalog/plant-cycle.svg"
            alt="A calm plant life-cycle learning illustration"
            fill
            priority
            sizes="(max-width: 760px) 88vw, 42vw"
          />
        </div>
        <p>
          Your lesson work stays in place while you recover access to your
          teaching studio.
        </p>
      </section>
      <section className={styles.formPanel}>
        <div className={styles.formContent}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
