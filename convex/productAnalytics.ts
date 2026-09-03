import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const ALLOWED_EVENTS = new Set([
  "landing_viewed",
  "cta_clicked",
  "onboarding_started",
  "identity_completed",
  "agent_selected",
  "shared_context_completed",
  "mitra_onboarding_completed",
  "tarla_onboarding_completed",
  "beta_terms_accepted",
  "first_task_configured",
  "plan_generated",
  "plan_approved",
  "whatsapp_ready",
  "dashboard_viewed",
  "message_scheduled",
  "provider_accepted",
  "message_delivered",
  "reply_received",
  "task_completed",
  "exception_created",
  "exception_resolved",
  "primary_user_intervention",
  "terms_viewed",
  "privacy_viewed",
]);

const agent = v.union(
  v.literal("mitra"),
  v.literal("tarla"),
  v.literal("both"),
);

export const capture = mutation({
  args: {
    anonymousId: v.string(),
    eventName: v.string(),
    ownerKey: v.optional(v.string()),
    householdId: v.optional(v.id("households")),
    route: v.optional(v.string()),
    agent: v.optional(agent),
    outcome: v.optional(v.string()),
    runId: v.optional(v.id("agentRuns")),
    taskType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const eventName = safeText(args.eventName, "Event name", 80);
    if (!ALLOWED_EVENTS.has(eventName)) {
      throw new Error("Analytics event is not allowlisted");
    }
    const anonymousId = safeText(args.anonymousId, "Anonymous ID", 120);
    if (args.householdId) {
      if (!args.ownerKey) throw new Error("Owner key is required for household events");
      const household = await ctx.db.get(args.householdId);
      if (!household || household.ownerKey !== args.ownerKey) {
        throw new Error("Household not found");
      }
    }
    const now = Date.now();
    return ctx.db.insert("productAnalyticsEvents", {
      anonymousId,
      eventKey: undefined,
      householdId: args.householdId,
      runId: args.runId,
      taskType: optionalText(args.taskType, "Task type", 120),
      eventName,
      route: optionalText(args.route, "Route", 120),
      agent: args.agent,
      outcome: optionalText(args.outcome, "Outcome", 120),
      occurredAt: now,
      createdAt: now,
    });
  },
});

export const listForHousehold = query({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
  },
  handler: async (ctx, args) => {
    const household = await ctx.db.get(args.householdId);
    if (!household || household.ownerKey !== args.ownerKey) {
      throw new Error("Household not found");
    }
    return ctx.db
      .query("productAnalyticsEvents")
      .withIndex("by_household_and_time", (q) =>
        q.eq("householdId", args.householdId),
      )
      .order("desc")
      .take(100);
  },
});

export const getExecutionSummary = query({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
  },
  handler: async (ctx, args) => {
    const household = await ctx.db.get(args.householdId);
    if (!household || household.ownerKey !== args.ownerKey) {
      throw new Error("Household not found");
    }
    const events = await ctx.db
      .query("productAnalyticsEvents")
      .withIndex("by_household_and_time", (q) =>
        q.eq("householdId", args.householdId),
      )
      .collect();
    const successfullyCompletedTasks = events.filter(
      (event) => event.eventName === "task_completed" && event.runId,
    ).length;
    const primaryUserInterventions = events.filter(
      (event) => event.eventName === "primary_user_intervention" && event.runId,
    ).length;
    return {
      successfullyCompletedTasks,
      primaryUserInterventions,
      interventionsPerSuccessfullyCompletedTask:
        successfullyCompletedTasks === 0
          ? null
          : primaryUserInterventions / successfullyCompletedTasks,
      definition:
        "A primary-user intervention is an execution decision or repair, not setup, browsing, delivery state, or a recipient reply.",
    };
  },
});

function safeText(value: string, label: string, maxLength: number) {
  const clean = value.trim();
  if (!clean) throw new Error(`${label} is required`);
  if (clean.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer`);
  }
  return clean;
}

function optionalText(
  value: string | undefined,
  label: string,
  maxLength: number,
) {
  if (value === undefined) return undefined;
  const clean = value.trim();
  if (!clean) return undefined;
  return safeText(clean, label, maxLength);
}
