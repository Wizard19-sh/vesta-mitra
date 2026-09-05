"use client";

import posthog from "posthog-js";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() ?? "https://us.i.posthog.com";

type PostHogEvent = "$pageview" | "onboarding_started" | "onboarding_completed";

let initialized = false;

function initializePostHog() {
  if (initialized) return true;
  if (typeof window === "undefined" || !key || !host) return false;

  posthog.init(key, {
    api_host: host,
    autocapture: false,
    capture_pageview: false,
  });
  initialized = true;
  return true;
}

export function capturePostHog(
  event: PostHogEvent,
  properties: Record<string, string> = {},
) {
  if (!initializePostHog()) return;
  posthog.capture(event, properties);
}
