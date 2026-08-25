import { publicPlaybackSchema } from "@avlp/schemas";
import React from "react";
import styles from "./page.module.css";

export default async function SharedLessonPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const response = await fetch(`${api}/share/${encodeURIComponent(token)}`, {
    cache: "no-store",
  });
  const result = publicPlaybackSchema.safeParse(
    response.ok ? await response.json() : null,
  );
  if (!result.success)
    return (
      <main className={styles.unavailable}>
        <h1>Lesson unavailable</h1>
        <p>This shared lesson is unavailable.</p>
      </main>
    );
  return (
    <main className={styles.theater}>
      <header className={styles.header}>
        <h1>{result.data.title}</h1>
      </header>
      <section className={styles.player} aria-label="Shared lesson playback">
        <video
          className={styles.video}
          controls
          preload="metadata"
          src={result.data.playbackUrl}
          poster={result.data.thumbnailUrl ?? undefined}
          aria-label="Shared lesson video"
        />
      </section>
    </main>
  );
}
