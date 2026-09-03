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
    childDisplayName: v.string(),
    salutation: v.string(),
    preferredLanguage: v.union(
      v.literal("English"),
      v.literal("Hindi"),
      v.literal("Hinglish"),
    ),
    communicationPreference: v.union(
      v.literal("Text"),
      v.literal("Voice"),
      v.literal("Both"),
    ),
    conversationStyle: v.union(
      v.literal("Warm & caring"),
      v.literal("Casual"),
      v.literal("Straightforward"),
    ),
    primaryIntent: v.union(
      v.literal("ROUTINES"),
      v.literal("WELLBEING"),
      v.literal("CONNECTION"),
      v.literal("OTHER"),
    ),
    primaryIntentOther: v.optional(v.string()),
    context: v.optional(v.string()),
    coordinationMode: v.optional(
      v.union(
        v.literal("senior_directly"),
        v.literal("caretaker"),
        v.literal("both"),
      ),
    ),
    caretakerMemberId: v.optional(v.id("members")),
  },
  handler: async (ctx, args) => ctx.db.insert("parents", args),
});

export const updateParent = mutation({
  args: {
    ownerKey: v.string(),
    parentId: v.id("parents"),
    name: v.string(),
    relationship: v.union(
      v.literal("Mother"),
      v.literal("Father"),
      v.literal("Other"),
    ),
    childDisplayName: v.string(),
    salutation: v.string(),
    preferredLanguage: v.union(
      v.literal("English"),
      v.literal("Hindi"),
      v.literal("Hinglish"),
    ),
    context: v.optional(v.string()),
    coordinationMode: v.optional(
      v.union(
        v.literal("senior_directly"),
        v.literal("caretaker"),
        v.literal("both"),
      ),
    ),
    caretakerMemberId: v.optional(v.id("members")),
  },
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.parentId);
    if (!parent || parent.ownerKey !== args.ownerKey) {
      throw new Error("Parent not found");
    }
    await ctx.db.patch(parent._id, {
      name: args.name.trim(),
      relationship: args.relationship,
      childDisplayName: args.childDisplayName.trim(),
      salutation: args.salutation.trim(),
      preferredLanguage: args.preferredLanguage,
      context: args.context?.trim() || undefined,
      coordinationMode: args.coordinationMode,
      caretakerMemberId: args.caretakerMemberId,
    });
    return parent._id;
  },
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
    topics: v.array(
      v.union(
        v.literal("Medication"),
        v.literal("Exercise / activity"),
        v.literal("How they're feeling"),
        v.literal("General check-in"),
        v.literal("Custom"),
      ),
    ),
    customTopic: v.optional(v.string()),
    frequency: v.union(
      v.literal("Once"),
      v.literal("Daily"),
      v.literal("Weekly"),
      v.literal("Monthly"),
    ),
    schedule: v.object({
      date: v.optional(v.string()),
      time: v.string(),
      dayOfWeek: v.optional(v.string()),
      dayOfMonth: v.optional(v.number()),
      timeZone: v.string(),
    }),
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

    const result = interpretResponse(
      checkIn.rawResponse,
      parent.name,
      routine.topics ?? [routine.type],
    );
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
