"use client";

import { useCallback } from "react";
import { useMutation } from "convex/react";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";
import {
  getOrCreateAnonymousId,
  readDeviceCredential,
} from "./aeviaSession";

export type ProductEvent =
  | "landing_viewed"
  | "cta_clicked"
  | "onboarding_started"
  | "identity_completed"
  | "agent_selected"
  | "shared_context_completed"
  | "mitra_onboarding_completed"
  | "tarla_onboarding_completed"
  | "beta_terms_accepted"
  | "first_task_configured"
  | "plan_generated"
  | "plan_approved"
  | "whatsapp_ready"
  | "dashboard_viewed"
  | "message_scheduled"
  | "provider_accepted"
  | "message_delivered"
  | "reply_received"
  | "task_completed"
  | "exception_created"
  | "exception_resolved"
  | "terms_viewed"
  | "privacy_viewed";

type EventContext = {
  householdId?: Id<"households">;
  route?: string;
  agent?: "mitra" | "tarla" | "both";
  outcome?: string;
};

export function useProductAnalytics() {
  const capture = useMutation(api.productAnalytics.capture);

  return useCallback(
    async (eventName: ProductEvent, context: EventContext = {}) => {
      const anonymousId = getOrCreateAnonymousId();
      if (!anonymousId) return;
      const ownerKey = context.householdId
        ? readDeviceCredential()
        : undefined;
      if (context.householdId && !ownerKey) return;

      try {
        await capture({
          anonymousId,
          eventName,
          ownerKey,
          householdId: context.householdId,
          route: context.route,
          agent: context.agent,
          outcome: context.outcome,
        });
      } catch {
        // Product work must remain usable if analytics is unavailable.
      }
    },
    [capture],
  );
}
