"use client";

import Image from "next/image";
import { motion } from "motion/react";
import styles from "./auth.module.css";

/**
 * The reassurance panel shared by every auth screen (sign in, register,
 * forgot password, reset password). Pulled out once so the four screens
 * cannot drift into different branding or copy over time.
 */
export function AuthAside({ message }: { message: string }) {
  return (
    <section className={styles.reassurance}>
      <span className={styles.brand}>AI Visual Learning Platform</span>

      <div className={styles.artFrameContainer}>
        <motion.div
          className={styles.artFrame}
          initial={{ opacity: 0, scale: 0.96 }}
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

      <p className={styles.reassuranceMessage}>{message}</p>
    </section>
  );
}
