import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { interpretResponse } from "./interpreter";

export const getJourney = query({
  args: { ownerKey: v.string() },
  handler: async (ctx, { ownerKey }) => {
    const parent = await ctx.db
      .query("parents")
      .withIndex("by_owner", (q) => q.eq("ownerKey", ownerKey))
      .order("desc")
      .first();

    if (!parent) return null;

    const routine = await ctx.db
      .query("routines")
      .withIndex("by_parent", (q) => q.eq("parentId", parent._id))
      .order("desc")
      .first();

    const checkIn = routine
      ? await ctx.db
          .query("checkIns")
          .withIndex("by_routine", (q) => q.eq("routineId", routine._id))
          .order("desc")
          .first()
      : null;

    return { parent, routine, checkIn };
  },
});

export const addParent = mutation({
  args: {
    ownerKey: v.string(),
    name: v.string(),
    relationship: v.union(
      v.literal("Mother"),
      v.literal("Father"),
      v.literal("Other"),
    ),
    context: v.optional(v.string()),
  },
  handler: async (ctx, args) => ctx.db.insert("parents", args),
});

export const createRoutine = mutation({
  args: {
    ownerKey: v.string(),
    parentId: v.id("parents"),
    type: v.union(
      v.literal("Medication"),
      v.literal("Exercise"),
      v.literal("How they're feeling"),
      v.literal("Custom"),
    ),
    frequency: v.union(v.literal("Once"), v.literal("Daily")),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    const routineId = await ctx.db.insert("routines", args);
    const now = Date.now();
    const checkInId = await ctx.db.insert("checkIns", {
      ownerKey: args.ownerKey,
      parentId: args.parentId,
      routineId,
      status: "NO_RESPONSE",
      createdAt: now,
      sentAt: now,
    });
    return { routineId, checkInId };
  },
});

export const saveRawResponse = mutation({
  args: {
    ownerKey: v.string(),
    checkInId: v.id("checkIns"),
    rawResponse: v.string(),
  },
  handler: async (ctx, { ownerKey, checkInId, rawResponse }) => {
    const checkIn = await ctx.db.get(checkInId);
    if (!checkIn || checkIn.ownerKey !== ownerKey) {
      throw new Error("Check-in not found");
    }
    await ctx.db.patch(checkInId, {
      rawResponse,
      responseAt: Date.now(),
    });
  },
});

export const interpretCheckIn = mutation({
  args: {
    ownerKey: v.string(),
    checkInId: v.id("checkIns"),
  },
  handler: async (ctx, { ownerKey, checkInId }) => {
    const checkIn = await ctx.db.get(checkInId);
    if (!checkIn || checkIn.ownerKey !== ownerKey || !checkIn.rawResponse) {
      throw new Error("A saved response is required");
    }
    const parent = await ctx.db.get(checkIn.parentId);
    const routine = await ctx.db.get(checkIn.routineId);
    if (!parent || !routine) throw new Error("Check-in details not found");

    const result = interpretResponse(checkIn.rawResponse, parent.name, routine.type);
    await ctx.db.patch(checkInId, {
      status: result.status,
      interpretation: {
        overall: result.overall,
        routineOutcome: result.routineOutcome,
        usefulContext: result.usefulContext,
        childAction: result.childAction,
      },
    });
  },
});
