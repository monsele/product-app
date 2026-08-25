"use client";

import { useState, type FormEvent } from "react";

type AuthMode = "register" | "login";
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function AuthForm({ mode }: { mode: AuthMode }) {
  const [error, setError] = useState<string>();
  const title = mode === "register" ? "Create your account" : "Sign in";
  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(undefined);
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
    }
  }
  return (
    <main>
      <h1>{title}</h1>
      <form onSubmit={submit}>
        <label>
          Email{" "}
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <label>
          Password{" "}
          <input
            name="password"
            type="password"
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
            minLength={mode === "register" ? 12 : undefined}
            required
          />
        </label>
        {error === undefined ? null : <p role="alert">{error}</p>}
        <button type="submit">{title}</button>
      </form>
      {mode === "login" ? (
        <a href="/forgot-password">Forgot password?</a>
      ) : null}
    </main>
  );
}
