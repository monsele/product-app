import { clearTimeout, setTimeout } from "node:timers";

/**
 * Sleeps between poll cycles, resolving early when the caller aborts so a
 * shutdown never waits out a full interval.
 */
export function waitForPoll(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
  });
}
