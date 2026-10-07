"use client";

import React from "react";

import { BrandLogo } from "../components/brand/brand-logo";
import { LessonReel } from "../components/brand/lesson-reel";
import styles from "./auth.module.css";

/**
 * The reassurance panel shared by every auth screen (sign in, register,
 * forgot password, reset password). Pulled out once so the four screens
 * cannot drift into different branding or copy over time.
 */
export function AuthAside({ message }: { message: string }) {
  return (
    <section className={styles.reassurance}>
      <span className={styles.brand}>
        <BrandLogo size={30} />
      </span>

      <div className={styles.artFrameContainer}>
        <div className={styles.reelFrame}>
          <LessonReel />
        </div>
      </div>

      <p className={styles.reassuranceMessage}>{message}</p>
    </section>
  );
}
