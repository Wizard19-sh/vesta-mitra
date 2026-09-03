import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

export async function recordExecutionEvent(
  ctx: MutationCtx,
  input: {
    eventKey: string;
    householdId: Id<"households">;
    runId: Id<"agentRuns">;
    taskType: string;
    eventName:
      | "message_scheduled"
      | "provider_accepted"
      | "message_delivered"
      | "reply_received"
      | "task_completed"
      | "exception_created"
      | "exception_resolved"
      | "primary_user_intervention";
    agent: "mitra" | "tarla";
    outcome?: string;
  },
) {
  const existing = await ctx.db
    .query("productAnalyticsEvents")
    .withIndex("by_event_key", (q) => q.eq("eventKey", input.eventKey))
    .unique();
  if (existing) return existing._id;
  const now = Date.now();
  return ctx.db.insert("productAnalyticsEvents", {
    eventKey: input.eventKey,
    anonymousId: `execution:${input.householdId}`,
    householdId: input.householdId,
    runId: input.runId,
    taskType: input.taskType,
    eventName: input.eventName,
    agent: input.agent,
    outcome: input.outcome,
    occurredAt: now,
    createdAt: now,
  });
}

export async function ensureEvidenceRecord(
  ctx: MutationCtx,
  input: {
    run: Doc<"agentRuns">;
    surface: "whatsapp" | "development_transport";
    recipientClass: string;
    outcome: string;
    primaryRubricClaim: string;
  },
) {
  const existing = await ctx.db
    .query("evidenceRecords")
    .withIndex("by_run", (q) => q.eq("runId", input.run._id))
    .unique();
  const now = Date.now();
  if (existing) {
    await ctx.db.patch(existing._id, {
      surface: input.surface,
      recipientClass: input.recipientClass,
      outcome: input.outcome,
      primaryRubricClaim: input.primaryRubricClaim,
      updatedAt: now,
    });
    return existing._id;
  }
  return ctx.db.insert("evidenceRecords", {
    evidenceId: `EVD-RUN-${input.run.runId}`,
    runId: input.run._id,
    householdId: input.run.householdId,
    taskType: input.run.taskType,
    timestamp: input.run.startedAt ?? input.run.createdAt,
    surface: input.surface,
    recipientClass: input.recipientClass,
    outcome: input.outcome,
    primaryRubricClaim: input.primaryRubricClaim,
    artifactStatus: "MISSING",
    createdAt: now,
    updatedAt: now,
  });
}

export async function markTaskComplete(
  ctx: MutationCtx,
  input: {
    run: Doc<"agentRuns">;
    agent: "mitra" | "tarla";
    outcome: string;
    recipientClass: string;
    surface: "whatsapp" | "development_transport";
  },
) {
  const completedAt = Date.now();
  await ctx.db.patch(input.run._id, {
    status: "completed",
    completedAt,
    totalLatencyMs:
      input.run.startedAt === undefined
        ? undefined
        : completedAt - input.run.startedAt,
    outcome: input.outcome,
    successfullyCompletedTask: true,
    updatedAt: completedAt,
  });
  await recordExecutionEvent(ctx, {
    eventKey: `${input.run._id}:task_completed`,
    householdId: input.run.householdId,
    runId: input.run._id,
    taskType: input.run.taskType,
    eventName: "task_completed",
    agent: input.agent,
    outcome: input.outcome,
  });
  return ensureEvidenceRecord(ctx, {
    run: input.run,
    surface: input.surface,
    recipientClass: input.recipientClass,
    outcome: input.outcome,
    primaryRubricClaim: "Real output on a real surface",
  });
}

export async function createExecutionException(
  ctx: MutationCtx,
  input: {
    householdId: Id<"households">;
    runId: Id<"agentRuns">;
    agent: "mitra" | "tarla";
    taskType: string;
    checkInId?: Id<"checkIns">;
    tarlaExecutionId?: Id<"tarlaExecutions">;
    sourceMemberId?: Id<"members">;
    riskClass: "low" | "medium" | "high";
    policyCode: string;
    rawRequest: string;
    proposedAction: string;
    status: "pending_approval" | "needs_review" | "auto_resolved";
    requiredApproverMemberId?: Id<"members">;
  },
) {
  const now = Date.now();
  const exceptionId = await ctx.db.insert("executionExceptions", {
    ...input,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(input.runId, {
    primaryUserInterventionRequired: input.status !== "auto_resolved",
    updatedAt: now,
  });
  await recordExecutionEvent(ctx, {
    eventKey: `${exceptionId}:created`,
    householdId: input.householdId,
    runId: input.runId,
    taskType: input.taskType,
    eventName: "exception_created",
    agent: input.agent,
    outcome: input.status,
  });
  if (input.status !== "auto_resolved") {
    await recordExecutionEvent(ctx, {
      eventKey: `${exceptionId}:primary_user_intervention`,
      householdId: input.householdId,
      runId: input.runId,
      taskType: input.taskType,
      eventName: "primary_user_intervention",
      agent: input.agent,
      outcome: input.policyCode,
    });
  }
  return exceptionId;
}
