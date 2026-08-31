import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

const agent = v.union(
  v.literal("mitra"),
  v.literal("tarla"),
  v.literal("vesta"),
);

const runStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("waiting"),
  v.literal("completed"),
  v.literal("failed"),
);

type RunStatus =
  | "queued"
  | "running"
  | "waiting"
  | "completed"
  | "failed";

export const createRun = mutation({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
    agent,
    taskType: v.string(),
    inputSummary: v.optional(v.string()),
    estimatedCost: v.optional(v.number()),
    costCurrency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ownedHousehold(ctx, args.householdId, args.ownerKey);
    optionalNonNegative(args.estimatedCost, "Estimated cost");
    const now = Date.now();
    const runId = crypto.randomUUID();
    const id = await ctx.db.insert("agentRuns", {
      runId,
      agent: args.agent,
      householdId: args.householdId,
      taskType: requiredText(args.taskType, "Task type", 120),
      status: "queued",
      estimatedCost: args.estimatedCost,
      costCurrency: optionalText(args.costCurrency, "Cost currency", 10),
      inputSummary: optionalText(args.inputSummary, "Input summary", 1_000),
      createdAt: now,
      updatedAt: now,
    });
    return { id, runId };
  },
});

export const updateRunStatus = mutation({
  args: {
    ownerKey: v.string(),
    runId: v.string(),
    status: runStatus,
    outputSummary: v.optional(v.string()),
    error: v.optional(v.string()),
    actualCost: v.optional(v.number()),
    costCurrency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ownedRunByPublicId(ctx, args.runId, args.ownerKey);
    optionalNonNegative(args.actualCost, "Actual cost");
    const now = Date.now();
    const timing = runTiming(run, args.status, now);

    await ctx.db.patch(run._id, {
      status: args.status,
      ...timing,
      ...(args.outputSummary === undefined
        ? {}
        : {
            outputSummary: optionalText(
              args.outputSummary,
              "Output summary",
              1_000,
            ),
          }),
      ...(args.error === undefined
        ? {}
        : { error: optionalText(args.error, "Run error", 1_000) }),
      ...(args.actualCost === undefined
        ? {}
        : { actualCost: args.actualCost }),
      ...(args.costCurrency === undefined
        ? {}
        : {
            costCurrency: optionalText(
              args.costCurrency,
              "Cost currency",
              10,
            ),
          }),
      updatedAt: now,
    });
    return run._id;
  },
});

export const addRunStep = mutation({
  args: {
    ownerKey: v.string(),
    runId: v.string(),
    name: v.string(),
    order: v.number(),
    inputSummary: v.optional(v.string()),
    estimatedCost: v.optional(v.number()),
    costCurrency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ownedRunByPublicId(ctx, args.runId, args.ownerKey);
    if (!Number.isInteger(args.order) || args.order < 1) {
      throw new Error("Step order must be a positive integer");
    }
    optionalNonNegative(args.estimatedCost, "Estimated cost");

    const duplicate = await ctx.db
      .query("agentRunSteps")
      .withIndex("by_run_and_order", (q) =>
        q.eq("runId", run._id).eq("order", args.order),
      )
      .unique();
    if (duplicate) throw new Error(`Run step ${args.order} already exists`);

    const now = Date.now();
    return ctx.db.insert("agentRunSteps", {
      runId: run._id,
      name: requiredText(args.name, "Step name", 120),
      order: args.order,
      status: "queued",
      inputSummary: optionalText(args.inputSummary, "Input summary", 1_000),
      estimatedCost: args.estimatedCost,
      costCurrency: optionalText(args.costCurrency, "Cost currency", 10),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateRunStep = mutation({
  args: {
    ownerKey: v.string(),
    stepId: v.id("agentRunSteps"),
    status: runStatus,
    outputSummary: v.optional(v.string()),
    error: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    actualCost: v.optional(v.number()),
    costCurrency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const step = await ctx.db.get(args.stepId);
    if (!step) throw new Error("Run step not found");
    const run = await ctx.db.get(step.runId);
    if (!run) throw new Error("Agent run not found");
    await ownedHousehold(ctx, run.householdId, args.ownerKey);
    optionalWholeNumber(args.inputTokens, "Input tokens");
    optionalWholeNumber(args.outputTokens, "Output tokens");
    optionalNonNegative(args.actualCost, "Actual cost");

    const now = Date.now();
    const timing = stepTiming(step, args.status, now);
    await ctx.db.patch(step._id, {
      status: args.status,
      ...timing,
      ...(args.outputSummary === undefined
        ? {}
        : {
            outputSummary: optionalText(
              args.outputSummary,
              "Output summary",
              1_000,
            ),
          }),
      ...(args.error === undefined
        ? {}
        : { error: optionalText(args.error, "Step error", 1_000) }),
      ...(args.inputTokens === undefined
        ? {}
        : { inputTokens: args.inputTokens }),
      ...(args.outputTokens === undefined
        ? {}
        : { outputTokens: args.outputTokens }),
      ...(args.actualCost === undefined
        ? {}
        : { actualCost: args.actualCost }),
      ...(args.costCurrency === undefined
        ? {}
        : {
            costCurrency: optionalText(
              args.costCurrency,
              "Cost currency",
              10,
            ),
          }),
      updatedAt: now,
    });
    return step._id;
  },
});

export const listRuns = query({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
  },
  handler: async (ctx, { ownerKey, householdId }) => {
    await ownedHousehold(ctx, householdId, ownerKey);
    return ctx.db
      .query("agentRuns")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .order("desc")
      .collect();
  },
});

export const getRunTrace = query({
  args: {
    ownerKey: v.string(),
    runId: v.string(),
  },
  handler: async (ctx, { ownerKey, runId }) => {
    const run = await ownedRunByPublicId(ctx, runId, ownerKey);
    const steps = await ctx.db
      .query("agentRunSteps")
      .withIndex("by_run_and_order", (q) => q.eq("runId", run._id))
      .order("asc")
      .collect();
    return { run, steps };
  },
});

async function ownedRunByPublicId(
  ctx: QueryCtx | MutationCtx,
  runId: string,
  ownerKey: string,
) {
  const run = await ctx.db
    .query("agentRuns")
    .withIndex("by_run_id", (q) => q.eq("runId", runId))
    .unique();
  if (!run) throw new Error("Agent run not found");
  await ownedHousehold(ctx, run.householdId, ownerKey);
  return run;
}

async function ownedHousehold(
  ctx: QueryCtx | MutationCtx,
  householdId: Id<"households">,
  ownerKey: string,
) {
  const household = await ctx.db.get(householdId);
  if (!household || household.ownerKey !== ownerKey) {
    throw new Error("Household not found");
  }
  return household;
}

function runTiming(
  run: Doc<"agentRuns">,
  status: RunStatus,
  now: number,
) {
  const startedAt = run.startedAt ??
    (status === "running" || status === "completed" || status === "failed"
      ? now
      : undefined);
  if (status !== "completed" && status !== "failed") {
    return startedAt === undefined ? {} : { startedAt };
  }
  return {
    startedAt,
    completedAt: now,
    totalLatencyMs: startedAt === undefined ? undefined : now - startedAt,
  };
}

function stepTiming(
  step: Doc<"agentRunSteps">,
  status: RunStatus,
  now: number,
) {
  const startedAt = step.startedAt ??
    (status === "running" || status === "completed" || status === "failed"
      ? now
      : undefined);
  if (status !== "completed" && status !== "failed") {
    return startedAt === undefined ? {} : { startedAt };
  }
  return {
    startedAt,
    completedAt: now,
    latencyMs: startedAt === undefined ? undefined : now - startedAt,
  };
}

function requiredText(value: string, label: string, maxLength: number) {
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
  if (clean.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer`);
  }
  return clean;
}

function optionalNonNegative(value: number | undefined, label: string) {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
    throw new Error(`${label} must be a non-negative number`);
  }
}

function optionalWholeNumber(value: number | undefined, label: string) {
  if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}
