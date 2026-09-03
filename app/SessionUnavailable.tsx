"use client";

import Link from "next/link";
import styles from "./session-unavailable.module.css";

export function SessionUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <main className={styles.page}>
      <span aria-hidden="true">A</span>
      <h1>Your setup isn’t available in this browser.</h1>
      <p>
        Aevia can’t safely remember this household here. Check this browser’s
        privacy settings, then try again.
      </p>
      <div>
        <button type="button" onClick={onRetry}>Try again</button>
        <Link href="/">Back to Aevia</Link>
      </div>
    </main>
  );
}
