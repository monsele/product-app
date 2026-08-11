"use client";

import { useState, type FormEvent } from "react";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function ForgotPasswordForm() {
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(undefined);
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
    }
  }

  return (
    <main>
      <h1>Reset your password</h1>
      <form onSubmit={submit}>
        <label>
          Email{" "}
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <button type="submit">Send reset instructions</button>
      </form>
      {message === undefined ? null : <p role="status">{message}</p>}
      {error === undefined ? null : <p role="alert">{error}</p>}
      <a href="/sign-in">Back to sign in</a>
    </main>
  );
}

export function ResetPasswordForm({ token }: { token: string | undefined }) {
  const [error, setError] = useState<string>();

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
    }
  }

  return (
    <main>
      <h1>Choose a new password</h1>
      <form onSubmit={submit}>
        <label>
          New password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
        </label>
        <label>
          Confirm new password
          <input
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
          />
        </label>
        <button type="submit">Reset password</button>
      </form>
      {error === undefined ? null : <p role="alert">{error}</p>}
    </main>
  );
}
