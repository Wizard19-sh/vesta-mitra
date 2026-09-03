"use client";

import { useEffect, useRef } from "react";
import { useProductAnalytics } from "../lib/productAnalytics";

export function PolicyViewTracker({ type }: { type: "terms" | "privacy" }) {
  const track = useProductAnalytics();
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    void track(type === "terms" ? "terms_viewed" : "privacy_viewed", {
      route: type === "terms" ? "/terms" : "/privacy",
    });
  }, [track, type]);

  return null;
}
