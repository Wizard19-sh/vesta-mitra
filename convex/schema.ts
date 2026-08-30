import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  parents: defineTable({
    ownerKey: v.string(),
    name: v.string(),
    relationship: v.union(
      v.literal("Mother"),
      v.literal("Father"),
      v.literal("Other"),
    ),
    context: v.optional(v.string()),
  }).index("by_owner", ["ownerKey"]),

  routines: defineTable({
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
  })
    .index("by_owner", ["ownerKey"])
    .index("by_parent", ["parentId"]),

  checkIns: defineTable({
    ownerKey: v.string(),
    parentId: v.id("parents"),
    routineId: v.id("routines"),
    status: v.union(
      v.literal("OK"),
      v.literal("UNCONFIRMED"),
      v.literal("NEEDS_ATTENTION"),
      v.literal("NO_RESPONSE"),
    ),
    createdAt: v.number(),
    sentAt: v.number(),
    responseAt: v.optional(v.number()),
    rawResponse: v.optional(v.string()),
    interpretation: v.optional(
      v.object({
        overall: v.string(),
        routineOutcome: v.string(),
        usefulContext: v.string(),
        childAction: v.string(),
      }),
    ),
  })
    .index("by_owner", ["ownerKey"])
    .index("by_routine", ["routineId"]),
});
