"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, FilePdf, Play } from "@phosphor-icons/react";
import styles from "./workspace.module.css";

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * The visual half of the Create lesson surface. It explains the product's one
 * transformation, a teaching document becoming a visual lesson, so it plays
 * once on load at the Transform timing (docs/design.md 9.2) and then holds
 * still. Decorative only: the form beside it carries every instruction.
 */
export function CreateLessonArt() {
  const reduce = useReducedMotion();

  const enter = (delay: number, from: { x?: number; y?: number; scale?: number }) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, ...from },
          animate: { opacity: 1, x: 0, y: 0, scale: 1 },
          transition: { duration: 0.6, delay, ease: EASE },
        };

  return (
    <div className={styles.createArt} aria-hidden="true">
      <motion.div className={styles.artSource} {...enter(0.1, { x: -16 })}>
        <FilePdf size={22} weight="duotone" />
        <span>Your document</span>
      </motion.div>

      <motion.span className={styles.artArrow} {...enter(0.35, { x: -8 })}>
        <ArrowRight size={16} weight="bold" />
      </motion.span>

      <motion.div className={styles.artFrame} {...enter(0.45, { scale: 0.94, y: 8 })}>
        <Image
          src="/catalog/plant-cycle.svg"
          alt=""
          fill
          sizes="260px"
          style={{ objectFit: "cover" }}
        />
        <span className={styles.artPlay}>
          <Play size={14} weight="fill" />
        </span>
      </motion.div>
    </div>
  );
}
