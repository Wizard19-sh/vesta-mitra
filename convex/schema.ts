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
    childDisplayName: v.optional(v.string()),
    salutation: v.optional(v.string()),
    preferredLanguage: v.optional(
      v.union(v.literal("English"), v.literal("Hindi"), v.literal("Hinglish")),
    ),
    communicationPreference: v.optional(
      v.union(v.literal("Text"), v.literal("Voice"), v.literal("Both")),
    ),
    conversationStyle: v.optional(
      v.union(
        v.literal("Warm & caring"),
        v.literal("Casual"),
        v.literal("Straightforward"),
      ),
    ),
    primaryIntent: v.optional(
      v.union(
        v.literal("ROUTINES"),
        v.literal("WELLBEING"),
        v.literal("CONNECTION"),
        v.literal("OTHER"),
      ),
    ),
    primaryIntentOther: v.optional(v.string()),
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
    topics: v.optional(
      v.array(
        v.union(
          v.literal("Medication"),
          v.literal("Exercise / activity"),
          v.literal("How they're feeling"),
          v.literal("General check-in"),
          v.literal("Custom"),
        ),
      ),
    ),
    customTopic: v.optional(v.string()),
    frequency: v.union(
      v.literal("Once"),
      v.literal("Daily"),
      v.literal("Weekly"),
      v.literal("Monthly"),
    ),
    schedule: v.optional(
      v.object({
        date: v.optional(v.string()),
        time: v.string(),
        dayOfWeek: v.optional(v.string()),
        dayOfMonth: v.optional(v.number()),
        timeZone: v.string(),
      }),
    ),
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
