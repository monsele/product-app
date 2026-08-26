"use client";

import React, { useRef } from "react";
import { AppShell, type AppShellProps } from "./app-shell";

export interface AuthenticatedAppShellProps extends Omit<AppShellProps, "onSignOut"> {
  userEmail?: string;
}

export const AuthenticatedAppShell: React.FC<AuthenticatedAppShellProps> = (props) => {
  const formRef = useRef<HTMLFormElement>(null);

  const handleSignOut = () => {
    if (formRef.current) {
      formRef.current.submit();
    } else {
      fetch("/api/auth/sign-out", { method: "POST" }).then(() => {
        window.location.assign("/sign-in");
      });
    }
  };

  return (
    <>
      <form
        ref={formRef}
        action="/api/auth/sign-out"
        method="post"
        style={{ display: "none" }}
      >
        <button type="submit">Sign out</button>
      </form>
      <AppShell {...props} onSignOut={handleSignOut} />
    </>
  );
};
