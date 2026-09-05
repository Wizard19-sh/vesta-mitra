"use client";

import { getOrCreateAnonymousId } from "./aeviaSession";

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY?.trim();
const host = (
  process.env.NEXT_PUBLIC_POSTHOG_HOST?.trim() ?? "https://us.i.posthog.com"
).replace(/\/$/, "");

type PostHogEvent = "$pageview" | "onboarding_started" | "onboarding_completed";

export function capturePostHog(
  event: PostHogEvent,
  properties: Record<string, string> = {},
) {
  if (!key || typeof window === "undefined") return;

  const distinctId = getOrCreateAnonymousId();
  if (!distinctId) return;

  void fetch(`${host}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      event,
      properties: { $distinct_id: distinctId, ...properties },
    }),
    keepalive: true,
  }).catch(() => undefined);
}
