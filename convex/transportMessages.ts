import { v } from "convex/values";
import {
  type NormalizedDeliveryState,
  shouldApplyDeliveryState,
} from "../lib/messageTransport";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { recordExecutionEvent } from "./executionSupport";

export const getDispatchContext = internalQuery({
  args: { transportMessageId: v.id("transportMessages") },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.transportMessageId);
    if (!message) return null;
    const endpoint = await ctx.db.get(message.communicationEndpointId);
    if (!endpoint) return null;
    return { message, endpoint };
  },
});

export const markProviderAccepted = internalMutation({
  args: {
    transportMessageId: v.id("transportMessages"),
    providerMessageId: v.string(),
    providerStatus: v.string(),
    acceptedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.transportMessageId);
    if (!message) throw new Error("Transport message not found");
    if (message.status !== "requested") {
      return message._id;
    }
    const providerMessageId = requiredText(
      args.providerMessageId,
      "Provider message ID",
      200,
    );
    await ctx.db.patch(message._id, {
      providerMessageId,
      providerStatus: safeProviderStatus(args.providerStatus),
      status: "accepted",
      providerAcceptedAt: args.acceptedAt,
      updatedAt: args.acceptedAt,
    });
    if (message.checkInId) {
      const checkIn = await ctx.db.get(message.checkInId);
      if (checkIn && checkIn.status !== "FAILED") {
        const isFollowUp = message.purpose === "caretaker_no_response_follow_up";
        await ctx.db.patch(checkIn._id, {
          ...(isFollowUp
            ? { followUpOutboundMessageId: providerMessageId }
            : { outboundMessageId: providerMessageId }),
          sentAt: args.acceptedAt,
        });
      }
    }
    if (message.tarlaExecutionId) {
      const execution = await ctx.db.get(message.tarlaExecutionId);
      if (execution && execution.status !== "failed") {
        const isRevision = message.purpose?.startsWith("revised_") ?? false;
        await ctx.db.patch(execution._id, {
          ...(isRevision
            ? { revisedOutboundMessageId: providerMessageId }
            : message.purpose === "cook_recipe_answer"
              ? {}
              : {
                  outboundMessageId: providerMessageId,
                  sentAt: args.acceptedAt,
                }),
          updatedAt: args.acceptedAt,
        });
      }
    }
    await insertStepBeforeWaiting(ctx, message.runId, {
      name: "provider_accepted",
      inputSummary: "Submit the normalized outbound message to its provider adapter",
      outputSummary: `${providerDisplayName(message.provider)} accepted the WhatsApp message request as ${providerMessageId}`,
      status: "completed",
      provider: message.provider,
      outcome: "accepted",
    });
    const run = await ctx.db.get(message.runId);
    if (run && (run.agent === "mitra" || run.agent === "tarla")) {
      await recordExecutionEvent(ctx, {
        eventKey: `${message._id}:provider_accepted`,
        householdId: message.householdId,
        runId: message.runId,
        taskType: run.taskType,
        eventName: "provider_accepted",
        agent: run.agent,
        outcome: "accepted",
      });
    }
    if (run?.status === "waiting") {
      await ctx.db.patch(run._id, {
        outputSummary:
          "Provider accepted the outbound message; waiting for a normalized signal",
        updatedAt: args.acceptedAt,
      });
    }
    return message._id;
  },
});

export const markProviderFailed = internalMutation({
  args: {
    transportMessageId: v.id("transportMessages"),
    failureCode: v.optional(v.string()),
    failureSummary: v.string(),
    failedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.transportMessageId);
    if (!message) throw new Error("Transport message not found");
    if (message.status !== "requested") return message._id;
    const failureSummary = requiredText(
      args.failureSummary,
      "Failure summary",
      500,
    );
    const failureCode = optionalText(args.failureCode, 80);
    await ctx.db.patch(message._id, {
      status: "failed",
      failureCode,
      failureSummary,
      failedAt: args.failedAt,
      updatedAt: args.failedAt,
    });
    if (message.checkInId) {
      const checkIn = await ctx.db.get(message.checkInId);
      if (checkIn) {
        await ctx.db.patch(checkIn._id, {
          status: "FAILED",
          failureReason: failureSummary,
        });
      }
    }
    if (message.tarlaExecutionId) {
      const execution = await ctx.db.get(message.tarlaExecutionId);
      if (execution) {
        await ctx.db.patch(execution._id, {
          status: "failed",
          userEscalationRequired: false,
          updatedAt: args.failedAt,
        });
      }
    }
    await failWaitingStep(ctx, message.runId, failureSummary, args.failedAt);
    const run = await ctx.db.get(message.runId);
    if (run) {
      await ctx.db.patch(run._id, {
        status: "failed",
        error: failureSummary,
        completedAt: args.failedAt,
        totalLatencyMs:
          run.startedAt === undefined ? undefined : args.failedAt - run.startedAt,
        updatedAt: args.failedAt,
      });
    }
    return message._id;
  },
});

export const updateDeliveryStatus = internalMutation({
  args: {
    provider: v.string(),
    providerMessageId: v.string(),
    providerStatus: v.string(),
    normalizedStatus: v.union(
      v.literal("accepted"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("read"),
      v.literal("failed"),
    ),
    failureCode: v.optional(v.string()),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db
      .query("transportMessages")
      .withIndex("by_provider_message_id", (q) =>
        q.eq("providerMessageId", args.providerMessageId),
      )
      .unique();
    if (
      !message ||
      message.provider !== args.provider.trim().toLocaleLowerCase()
    ) {
      return null;
    }
    const status: NormalizedDeliveryState = args.normalizedStatus;
    if (!shouldApplyDeliveryState(message.status, status)) return message._id;
    const failureSummary = `${providerDisplayName(message.provider)} reported that the WhatsApp message was not delivered`;
    const update = {
      providerStatus: safeProviderStatus(args.providerStatus),
      status,
      ...(status === "sent" ? { sentAt: args.timestamp } : {}),
      ...(status === "delivered" ? { deliveredAt: args.timestamp } : {}),
      ...(status === "read" ? { readAt: args.timestamp } : {}),
      ...(status === "failed"
        ? {
            failedAt: args.timestamp,
            failureCode: optionalText(args.failureCode, 80),
            failureSummary,
          }
        : {}),
      updatedAt: args.timestamp,
    };
    await ctx.db.patch(message._id, update);
    await insertStepBeforeWaiting(ctx, message.runId, {
      name: `provider_${status}`,
      inputSummary: "Apply the provider-reported message lifecycle state",
      outputSummary:
        status === "accepted"
          ? `${providerDisplayName(message.provider)} accepted the message request; delivery is not implied`
          : `${providerDisplayName(message.provider)} reported ${status}`,
      status: "completed",
      provider: message.provider,
      outcome: status,
    });
    if (status === "delivered") {
      const run = await ctx.db.get(message.runId);
      if (run && (run.agent === "mitra" || run.agent === "tarla")) {
        await recordExecutionEvent(ctx, {
          eventKey: `${message._id}:delivered`,
          householdId: message.householdId,
          runId: message.runId,
          taskType: run.taskType,
          eventName: "message_delivered",
          agent: run.agent,
          outcome: "delivered",
        });
      }
    }
    if (status === "failed") {
      const linkedTaskFailed = await failLinkedTask(
        ctx,
        message,
        failureSummary,
        args.timestamp,
      );
      if (linkedTaskFailed) {
        await failWaitingStep(ctx, message.runId, failureSummary, args.timestamp);
        const run = await ctx.db.get(message.runId);
        if (run) {
          await ctx.db.patch(run._id, {
            status: "failed",
            error: failureSummary,
            completedAt: args.timestamp,
            totalLatencyMs:
              run.startedAt === undefined
                ? undefined
                : args.timestamp - run.startedAt,
            updatedAt: args.timestamp,
          });
        }
      }
    }
    return message._id;
  },
});

export const getMessage = query({
  args: { ownerKey: v.string(), messageId: v.string() },
  handler: async (ctx, args) => {
    const message = await ctx.db
      .query("transportMessages")
      .withIndex("by_message_id", (q) => q.eq("messageId", args.messageId))
      .unique();
    if (!message) return null;
    await requireOwner(ctx, message.householdId, args.ownerKey);
    return message;
  },
});

export const listForCheckIn = query({
  args: { ownerKey: v.string(), checkInId: v.id("checkIns") },
  handler: async (ctx, args) => {
    const checkIn = await ctx.db.get(args.checkInId);
    if (!checkIn?.householdId) throw new Error("Check-in not found");
    await requireOwner(ctx, checkIn.householdId, args.ownerKey);
    return ctx.db
      .query("transportMessages")
      .withIndex("by_check_in", (q) => q.eq("checkInId", checkIn._id))
      .collect();
  },
});

export const listForTarlaExecution = query({
  args: {
    ownerKey: v.string(),
    executionId: v.id("tarlaExecutions"),
  },
  handler: async (ctx, args) => {
    const execution = await ctx.db.get(args.executionId);
    if (!execution) throw new Error("Tarla execution not found");
    await requireOwner(ctx, execution.householdId, args.ownerKey);
    return ctx.db
      .query("transportMessages")
      .withIndex("by_tarla_execution", (q) =>
        q.eq("tarlaExecutionId", execution._id),
      )
      .collect();
  },
});

async function insertStepBeforeWaiting(
  ctx: MutationCtx,
  runId: Id<"agentRuns">,
  step: {
    name: string;
    inputSummary: string;
    outputSummary: string;
    status: "completed";
    provider?: string;
    outcome?: string;
  },
) {
  const steps = await ctx.db
    .query("agentRunSteps")
    .withIndex("by_run_and_order", (q) => q.eq("runId", runId))
    .collect();
  const waiting = steps
    .filter((candidate) => candidate.status === "waiting")
    .sort((left, right) => right.order - left.order)[0];
  const order = waiting
    ? waiting.order
    : Math.max(0, ...steps.map((candidate) => candidate.order)) + 1;
  if (waiting) {
    const later = steps
      .filter((candidate) => candidate.order >= order)
      .sort((left, right) => right.order - left.order);
    for (const candidate of later) {
      await ctx.db.patch(candidate._id, { order: candidate.order + 1 });
    }
  }
  const now = Date.now();
  await ctx.db.insert("agentRunSteps", {
    runId,
    order,
    name: step.name,
    status: step.status,
    startedAt: now,
    completedAt: now,
    latencyMs: 0,
    inputSummary: step.inputSummary,
    outputSummary: step.outputSummary,
    component: "transport",
    tool: "whatsapp",
    provider: step.provider,
    usageStatus: "not_applicable",
    outcome: step.outcome,
    createdAt: now,
    updatedAt: now,
  });
}

async function failWaitingStep(
  ctx: MutationCtx,
  runId: Id<"agentRuns">,
  error: string,
  failedAt: number,
) {
  const steps = await ctx.db
    .query("agentRunSteps")
    .withIndex("by_run_and_order", (q) => q.eq("runId", runId))
    .order("desc")
    .collect();
  const waiting = steps.find((step) => step.status === "waiting");
  if (waiting) {
    await ctx.db.patch(waiting._id, {
      status: "failed",
      completedAt: failedAt,
      latencyMs: failedAt - (waiting.startedAt ?? waiting.createdAt),
      error,
      updatedAt: failedAt,
    });
  }
  const order = Math.max(0, ...steps.map((step) => step.order)) + 1;
  await ctx.db.insert("agentRunSteps", {
    runId,
    order,
    name: "provider_failed",
    status: "failed",
    startedAt: failedAt,
    completedAt: failedAt,
    latencyMs: 0,
    inputSummary: "Dispatch the normalized message through its provider adapter",
    error,
    component: "transport",
    tool: "whatsapp",
    usageStatus: "not_applicable",
    outcome: "failed",
    createdAt: failedAt,
    updatedAt: failedAt,
  });
}

async function failLinkedTask(
  ctx: MutationCtx,
  message: Doc<"transportMessages">,
  failureSummary: string,
  failedAt: number,
) {
  let failed = false;
  if (message.checkInId) {
    const checkIn = await ctx.db.get(message.checkInId);
    if (checkIn && !["CONFIRMED", "OK"].includes(checkIn.status)) {
      await ctx.db.patch(checkIn._id, {
        status: "FAILED",
        failureReason: failureSummary,
      });
      failed = true;
    }
  }
  if (message.tarlaExecutionId) {
    const execution = await ctx.db.get(message.tarlaExecutionId);
    if (execution && execution.status !== "acknowledged") {
      await ctx.db.patch(execution._id, {
        status: "failed",
        updatedAt: failedAt,
      });
      failed = true;
    }
  }
  return failed;
}

async function requireOwner(
  ctx: QueryCtx,
  householdId: Id<"households">,
  ownerKey: string,
) {
  const household = await ctx.db.get(householdId);
  if (!household || household.ownerKey !== ownerKey) {
    throw new Error("Household not found");
  }
}

function safeProviderStatus(value: string) {
  return requiredText(value, "Provider status", 80).toLocaleLowerCase();
}

function requiredText(value: string, label: string, maxLength: number) {
  const clean = value.trim();
  if (!clean) throw new Error(`${label} is required`);
  if (clean.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer`);
  }
  return clean;
}

function optionalText(value: string | undefined, maxLength: number) {
  if (value === undefined) return undefined;
  const clean = value.trim();
  return clean ? clean.slice(0, maxLength) : undefined;
}

function providerDisplayName(provider: string) {
  switch (provider.trim().toLocaleLowerCase()) {
    case "twilio":
      return "Twilio";
    case "meta":
      return "Meta Cloud API";
    default:
      return "Messaging provider";
  }
}
