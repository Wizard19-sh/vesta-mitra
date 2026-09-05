"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { capturePostHog } from "../lib/posthog";

export function PostHogPageView() {
  const pathname = usePathname();

  useEffect(() => {
    capturePostHog("$pageview", {
      $current_url: window.location.href,
      $pathname: pathname,
    });
  }, [pathname]);

  return null;
}
