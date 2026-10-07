"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useReducedMotion } from "motion/react";
import styles from "./lesson-reel.module.css";

/*
 * Real frames rendered by the scene library from the canonical photosynthesis
 * fixture (public/lesson-frames). They are shown in lesson order.
 */
const FRAMES = [
  {
    src: "/lesson-frames/photosynthesis-hook.jpg",
    role: "Hook",
    title: "How does a plant make food?",
  },
  {
    src: "/lesson-frames/photosynthesis-key-term.jpg",
    role: "Key term",
    title: "Photosynthesis",
  },
  {
    src: "/lesson-frames/photosynthesis-process.jpg",
    role: "Process",
    title: "The photosynthesis system",
  },
  {
    src: "/lesson-frames/photosynthesis-summary.jpg",
    role: "Summary",
    title: "Remember photosynthesis",
  },
] as const;

const HOLD_MS = 3600;

/** Slot names by distance from the front frame. */
const SLOTS = ["front", "middle", "back", "hidden"] as const;

/**
 * Scenes from a real lesson, stacked like onion-skin frames. Every few seconds
 * the front scene lifts away and the next one comes forward. With reduced
 * motion the stack holds still on the first scene.
 */
export function LessonReel() {
  const reduceMotion = useReducedMotion();
  const [front, setFront] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const previousFront = useRef(0);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setInterval(() => {
      setFront((current) => (current + 1) % FRAMES.length);
    }, HOLD_MS);
    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  // The old front frame lifts away, then parks out of sight at the back.
  useEffect(() => {
    if (previousFront.current === front) return;
    setLeaving(previousFront.current);
    previousFront.current = front;
    const timer = window.setTimeout(() => setLeaving(null), 700);
    return () => window.clearTimeout(timer);
  }, [front]);

  const current = FRAMES[front] ?? FRAMES[0];

  return (
    <figure className={styles.reel}>
      <div className={styles.stack}>
        {FRAMES.map((frame, index) => {
          const distance = (index - front + FRAMES.length) % FRAMES.length;
          const slot = index === leaving && distance !== 0 ? "leaving" : SLOTS[distance];
          return (
            <div
              key={frame.src}
              className={styles.frame}
              data-slot={slot}
              aria-hidden={distance === 0 ? undefined : true}
            >
              <Image
                src={frame.src}
                alt={distance === 0 ? `${frame.role} scene: ${frame.title}` : ""}
                fill
                priority={index === 0}
                sizes="(max-width: 760px) 80vw, 36vw"
              />
            </div>
          );
        })}
      </div>
      <figcaption className={styles.caption}>
        <span className={styles.role}>{current.role}</span>
        <span className={styles.source}>Scenes from the photosynthesis sample lesson</span>
      </figcaption>
    </figure>
  );
}
