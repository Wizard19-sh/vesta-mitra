import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  households: defineTable({
    ownerKey: v.string(),
    name: v.string(),
    timezone: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerKey"]),

  members: defineTable({
    householdId: v.id("households"),
    name: v.string(),
    role: v.string(),
    age: v.optional(v.number()),
    sex: v.optional(v.string()),
    heightCm: v.optional(v.number()),
    weightKg: v.optional(v.number()),
    languagePreference: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_household", ["householdId"]),

  preferences: defineTable({
    householdId: v.id("households"),
    memberId: v.optional(v.id("members")),
    category: v.string(),
    key: v.string(),
    value: v.string(),
    source: v.union(
      v.literal("onboarding"),
      v.literal("explicit_correction"),
      v.literal("agent_observation"),
    ),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_household", ["householdId"])
    .index("by_member", ["memberId"]),

  communicationEndpoints: defineTable({
    householdId: v.id("households"),
    memberId: v.id("members"),
    channel: v.string(),
    address: v.string(),
    preferredLanguage: v.optional(v.string()),
    preferredMode: v.union(
      v.literal("text"),
      v.literal("voice"),
      v.literal("both"),
    ),
    providerMetadata: v.optional(
      v.object({
        provider: v.optional(v.string()),
        externalId: v.optional(v.string()),
      }),
    ),
    active: v.boolean(),
    consentStatus: v.union(
      v.literal("unknown"),
      v.literal("pending"),
      v.literal("granted"),
      v.literal("revoked"),
    ),
    verifiedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_household", ["householdId"])
    .index("by_member", ["memberId"])
    .index("by_channel_and_address", ["channel", "address"]),

  mitraMemberStates: defineTable({
    householdId: v.id("households"),
    memberId: v.id("members"),
    readiness: v.union(
      v.literal("not_introduced"),
      v.literal("ready"),
    ),
    introducedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_household", ["householdId"])
    .index("by_member", ["memberId"]),

  inboundSignals: defineTable({
    dedupeKey: v.string(),
    householdId: v.optional(v.id("households")),
    memberId: v.optional(v.id("members")),
    communicationEndpointId: v.optional(v.id("communicationEndpoints")),
    checkInId: v.optional(v.id("checkIns")),
    runId: v.optional(v.id("agentRuns")),
    senderAddress: v.string(),
    channel: v.string(),
    signalType: v.union(
      v.literal("text"),
      v.literal("reaction"),
      v.literal("acknowledgement"),
    ),
    rawContent: v.string(),
    messageId: v.string(),
    timestamp: v.number(),
    metadata: v.optional(
      v.object({
        inReplyToMessageId: v.optional(v.string()),
        reactionToMessageId: v.optional(v.string()),
      }),
    ),
    matched: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_dedupe_key", ["dedupeKey"])
    .index("by_endpoint_and_timestamp", [
      "communicationEndpointId",
      "timestamp",
    ])
    .index("by_check_in", ["checkInId"]),

  devTransportMessages: defineTable({
    messageId: v.string(),
    householdId: v.id("households"),
    memberId: v.id("members"),
    communicationEndpointId: v.id("communicationEndpoints"),
    checkInId: v.id("checkIns"),
    runId: v.id("agentRuns"),
    routineId: v.id("routines"),
    recipientAddress: v.string(),
    channel: v.string(),
    message: v.string(),
    sentAt: v.number(),
  })
    .index("by_message_id", ["messageId"])
    .index("by_check_in", ["checkInId"]),

  agentRuns: defineTable({
    runId: v.string(),
    agent: v.union(
      v.literal("mitra"),
      v.literal("tarla"),
      v.literal("vesta"),
    ),
    householdId: v.id("households"),
    taskType: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("waiting"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    totalLatencyMs: v.optional(v.number()),
    estimatedCost: v.optional(v.number()),
    actualCost: v.optional(v.number()),
    costCurrency: v.optional(v.string()),
    inputSummary: v.optional(v.string()),
    outputSummary: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_run_id", ["runId"])
    .index("by_household", ["householdId"]),

  agentRunSteps: defineTable({
    runId: v.id("agentRuns"),
    name: v.string(),
    order: v.number(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("waiting"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    latencyMs: v.optional(v.number()),
    inputSummary: v.optional(v.string()),
    outputSummary: v.optional(v.string()),
    error: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    estimatedCost: v.optional(v.number()),
    actualCost: v.optional(v.number()),
    costCurrency: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_run_and_order", ["runId", "order"]),

  parents: defineTable({
    ownerKey: v.string(),
    householdId: v.optional(v.id("households")),
    memberId: v.optional(v.id("members")),
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
  })
    .index("by_owner", ["ownerKey"])
    .index("by_household", ["householdId"])
    .index("by_member", ["memberId"]),

  routines: defineTable({
    ownerKey: v.string(),
    parentId: v.id("parents"),
    householdId: v.optional(v.id("households")),
    memberId: v.optional(v.id("members")),
    communicationEndpointId: v.optional(v.id("communicationEndpoints")),
    type: v.union(
      v.literal("Medication"),
      v.literal("Exercise"),
      v.literal("Walk / activity"),
      v.literal("Appointment / checkup"),
      v.literal("How they're feeling"),
      v.literal("Custom"),
    ),
    topics: v.optional(
      v.array(
        v.union(
          v.literal("Medication"),
          v.literal("Exercise / activity"),
          v.literal("Walk / activity"),
          v.literal("Appointment / checkup"),
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
    w2Enabled: v.optional(v.boolean()),
    label: v.optional(v.string()),
    timing: v.optional(
      v.union(
        v.object({
          kind: v.literal("once_now"),
          timezone: v.string(),
        }),
        v.object({
          kind: v.literal("once_scheduled"),
          timezone: v.string(),
          scheduledAt: v.number(),
        }),
        v.object({
          kind: v.literal("recurring"),
          timezone: v.string(),
          recurrence: v.object({
            frequency: v.union(
              v.literal("daily"),
              v.literal("selected_days"),
              v.literal("weekly"),
              v.literal("monthly"),
            ),
            time: v.string(),
            daysOfWeek: v.optional(v.array(v.number())),
            dayOfMonth: v.optional(v.number()),
          }),
        }),
      ),
    ),
    responseWindowMs: v.optional(v.number()),
    confirmingReactions: v.optional(v.array(v.string())),
    nextOccurrenceAt: v.optional(v.number()),
    lastOccurrenceAt: v.optional(v.number()),
    scheduledJobId: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerKey"])
    .index("by_parent", ["parentId"])
    .index("by_household", ["householdId"])
    .index("by_member", ["memberId"])
    .index("by_next_occurrence", ["nextOccurrenceAt"]),

  checkIns: defineTable({
    ownerKey: v.string(),
    parentId: v.id("parents"),
    routineId: v.id("routines"),
    status: v.union(
      v.literal("SCHEDULED"),
      v.literal("SENT"),
      v.literal("WAITING"),
      v.literal("CONFIRMED"),
      v.literal("OK"),
      v.literal("UNCONFIRMED"),
      v.literal("NEEDS_ATTENTION"),
      v.literal("NO_RESPONSE"),
      v.literal("FAILED"),
    ),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
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
    householdId: v.optional(v.id("households")),
    memberId: v.optional(v.id("members")),
    communicationEndpointId: v.optional(v.id("communicationEndpoints")),
    scheduledFor: v.optional(v.number()),
    occurrenceKey: v.optional(v.string()),
    outboundMessageId: v.optional(v.string()),
    expectedResponseBy: v.optional(v.number()),
    responseTimeoutJobId: v.optional(v.string()),
    inboundSignalReceived: v.optional(v.boolean()),
    latestInboundSignalId: v.optional(v.id("inboundSignals")),
    selfReportInterpretation: v.optional(
      v.object({
        outcome: v.union(
          v.literal("confirmed"),
          v.literal("negative"),
          v.literal("ambiguous"),
          v.literal("unrelated"),
          v.literal("reaction_unmapped"),
          v.literal("reaction_confirmed"),
          v.literal("acknowledged"),
          v.literal("no_response"),
        ),
        summary: v.string(),
        basis: v.union(
          v.literal("self_report"),
          v.literal("configured_reaction"),
          v.literal("acknowledgement"),
          v.literal("response_window"),
        ),
      }),
    ),
    confirmedAt: v.optional(v.number()),
    runId: v.optional(v.id("agentRuns")),
    failureReason: v.optional(v.string()),
  })
    .index("by_owner", ["ownerKey"])
    .index("by_routine", ["routineId"])
    .index("by_member", ["memberId"])
    .index("by_occurrence_key", ["occurrenceKey"]),
});
