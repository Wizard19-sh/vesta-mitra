import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const nutrition = v.object({
  caloriesKcal: v.number(),
  proteinG: v.number(),
  carbohydratesG: v.number(),
  fatG: v.number(),
  fibreG: v.number(),
});

export default defineSchema({
  households: defineTable({
    ownerKey: v.string(),
    name: v.string(),
    timezone: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner", ["ownerKey"]),

  betaUserProfiles: defineTable({
    ownerKey: v.string(),
    householdId: v.id("households"),
    memberId: v.id("members"),
    name: v.string(),
    email: v.string(),
    termsVersion: v.string(),
    privacyVersion: v.string(),
    acceptedAt: v.number(),
    betaStatus: v.literal("accepted"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerKey"])
    .index("by_household", ["householdId"]),

  productAnalyticsEvents: defineTable({
    anonymousId: v.string(),
    householdId: v.optional(v.id("households")),
    eventName: v.string(),
    route: v.optional(v.string()),
    agent: v.optional(
      v.union(v.literal("mitra"), v.literal("tarla"), v.literal("both")),
    ),
    outcome: v.optional(v.string()),
    occurredAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_anonymous_and_time", ["anonymousId", "occurredAt"])
    .index("by_household_and_time", ["householdId", "occurredAt"])
    .index("by_event", ["eventName"]),

  members: defineTable({
    householdId: v.id("households"),
    name: v.string(),
    role: v.string(),
    relationship: v.optional(v.string()),
    lifeStage: v.optional(
      v.union(v.literal("adult"), v.literal("child"), v.literal("senior")),
    ),
    preferredSalutation: v.optional(v.string()),
    memberKind: v.optional(
      v.union(v.literal("household"), v.literal("external")),
    ),
    active: v.optional(v.boolean()),
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
    expiresAt: v.optional(v.number()),
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
        ready: v.optional(v.boolean()),
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
    tarlaExecutionId: v.optional(v.id("tarlaExecutions")),
    runId: v.optional(v.id("agentRuns")),
    agent: v.optional(
      v.union(
        v.literal("mitra"),
        v.literal("tarla"),
        v.literal("vesta"),
      ),
    ),
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
        provider: v.optional(v.string()),
        webhookReceivedAt: v.optional(v.number()),
        webhookValidatedAt: v.optional(v.number()),
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
    .index("by_check_in", ["checkInId"])
    .index("by_tarla_execution", ["tarlaExecutionId"]),

  tarlaHouseholdProfiles: defineTable({
    householdId: v.id("households"),
    mealsPreparedAtHome: v.array(v.string()),
    usualMealTimes: v.array(
      v.object({
        meal: v.string(),
        time: v.string(),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_household", ["householdId"]),

  tarlaMemberProfiles: defineTable({
    householdId: v.id("households"),
    memberId: v.id("members"),
    dietaryType: v.union(
      v.literal("vegetarian"),
      v.literal("eggetarian"),
      v.literal("non_vegetarian"),
    ),
    activityLevel: v.optional(
      v.union(
        v.literal("sedentary"),
        v.literal("lightly_active"),
        v.literal("moderately_active"),
        v.literal("very_active"),
        v.literal("extra_active"),
      ),
    ),
    allergies: v.array(v.string()),
    dislikedFoods: v.array(v.string()),
    avoidedFoods: v.array(v.string()),
    limitedFoods: v.array(v.string()),
    favouriteFoods: v.array(v.string()),
    mealsAtHome: v.array(v.string()),
    servingEquivalent: v.number(),
    includedInPlanning: v.optional(v.boolean()),
    foodContext: v.optional(v.string()),
    cookNotes: v.optional(v.string()),
    nutritionRequested: v.boolean(),
    nutritionEquation: v.optional(v.literal("mifflin_st_jeor")),
    estimatedBmrKcal: v.optional(v.number()),
    estimatedTdeeKcal: v.optional(v.number()),
    nutritionGoal: v.optional(
      v.union(
        v.literal("maintenance"),
        v.literal("deficit_10"),
        v.literal("deficit_20"),
        v.literal("custom"),
      ),
    ),
    planningGoal: v.optional(
      v.union(
        v.literal("balanced"),
        v.literal("maintain"),
        v.literal("moderate_deficit"),
        v.literal("stronger_deficit"),
        v.literal("high_protein"),
        v.literal("custom"),
      ),
    ),
    calorieTargetKcal: v.optional(v.number()),
    proteinTargetG: v.optional(v.number()),
    fatTargetG: v.optional(v.number()),
    carbohydratesTargetG: v.optional(v.number()),
    fibreTargetG: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_household", ["householdId"])
    .index("by_member", ["memberId"]),

  tarlaDietaryRules: defineTable({
    householdId: v.id("households"),
    memberId: v.optional(v.id("members")),
    ruleType: v.union(
      v.literal("vegetarian_days"),
      v.literal("non_vegetarian_allowed_days"),
      v.literal("ingredient_excluded_days"),
      v.literal("ingredient_frequency_limit"),
      v.literal("avoid_recipe_repeat"),
      v.literal("custom_days"),
    ),
    daysOfWeek: v.optional(v.array(v.number())),
    ingredientKey: v.optional(v.string()),
    mealSlot: v.optional(v.string()),
    maxOccurrences: v.optional(v.number()),
    windowDays: v.optional(v.number()),
    description: v.string(),
    active: v.boolean(),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_household", ["householdId"])
    .index("by_member", ["memberId"]),

  tarlaCookStates: defineTable({
    householdId: v.id("households"),
    memberId: v.id("members"),
    communicationEndpointId: v.id("communicationEndpoints"),
    usualArrivalTime: v.optional(v.string()),
    cookingConstraints: v.optional(v.string()),
    communicationTone: v.optional(v.string()),
    relationshipType: v.optional(
      v.union(
        v.literal("hired_cook"),
        v.literal("family_cook"),
        v.literal("primary_user"),
        v.literal("other"),
      ),
    ),
    active: v.optional(v.boolean()),
    visitFrequency: v.optional(
      v.union(
        v.literal("once_daily"),
        v.literal("twice_daily"),
        v.literal("custom"),
      ),
    ),
    readiness: v.union(
      v.literal("not_primed"),
      v.literal("priming_generated"),
      v.literal("primed"),
      v.literal("ready"),
    ),
    primingMessage: v.optional(v.string()),
    primingGeneratedAt: v.optional(v.number()),
    primedAt: v.optional(v.number()),
    readyAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_household", ["householdId"])
    .index("by_member", ["memberId"]),

  tarlaCookVisits: defineTable({
    householdId: v.id("households"),
    cookStateId: v.id("tarlaCookStates"),
    cookMemberId: v.id("members"),
    label: v.string(),
    daysOfWeek: v.array(v.number()),
    arrivalTime: v.string(),
    timezone: v.string(),
    instructionLeadMinutes: v.number(),
    mealSlots: v.array(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_household", ["householdId"])
    .index("by_cook_state", ["cookStateId"]),

  tarlaDayPlans: defineTable({
    householdId: v.id("households"),
    requestedByMemberId: v.id("members"),
    runId: v.id("agentRuns"),
    seriesId: v.string(),
    targetDate: v.string(),
    status: v.union(
      v.literal("awaiting_approval"),
      v.literal("rejected"),
      v.literal("approved"),
      v.literal("scheduled"),
      v.literal("superseded"),
      v.literal("executing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    version: v.number(),
    previousDayPlanId: v.optional(v.id("tarlaDayPlans")),
    mealSlots: v.array(v.string()),
    totalNutrition: nutrition,
    memberDailyNutrition: v.array(
      v.object({
        memberId: v.id("members"),
        memberName: v.string(),
        meals: v.array(
          v.object({
            mealSlot: v.string(),
            nutrition,
          }),
        ),
        total: nutrition,
        targets: v.object({
          caloriesKcal: v.optional(v.number()),
          proteinG: v.optional(v.number()),
          carbohydratesG: v.optional(v.number()),
          fatG: v.optional(v.number()),
          fibreG: v.optional(v.number()),
        }),
        variance: v.object({
          caloriesKcal: v.optional(v.number()),
          proteinG: v.optional(v.number()),
          carbohydratesG: v.optional(v.number()),
          fatG: v.optional(v.number()),
          fibreG: v.optional(v.number()),
        }),
      }),
    ),
    constraintChecks: v.array(
      v.object({
        name: v.string(),
        passed: v.boolean(),
        detail: v.string(),
      }),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    approvedAt: v.optional(v.number()),
  })
    .index("by_household", ["householdId"])
    .index("by_series", ["seriesId"]),

  tarlaDayPlanMeals: defineTable({
    dayPlanId: v.id("tarlaDayPlans"),
    mealPlanId: v.id("tarlaMealPlans"),
    mealSlot: v.string(),
    locked: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_day_plan", ["dayPlanId"])
    .index("by_meal_plan", ["mealPlanId"]),

  tarlaDayPlanFeedback: defineTable({
    householdId: v.id("households"),
    dayPlanId: v.id("tarlaDayPlans"),
    runId: v.id("agentRuns"),
    memberId: v.id("members"),
    feedbackType: v.union(
      v.literal("approval"),
      v.literal("correction"),
    ),
    rawContent: v.string(),
    interpretation: v.optional(v.string()),
    preferenceId: v.optional(v.id("preferences")),
    createdAt: v.number(),
  })
    .index("by_day_plan", ["dayPlanId"])
    .index("by_run", ["runId"]),

  tarlaMealPlans: defineTable({
    householdId: v.id("households"),
    requestedByMemberId: v.id("members"),
    runId: v.id("agentRuns"),
    targetDate: v.string(),
    mealSlot: v.string(),
    contextLabel: v.optional(v.string()),
    status: v.union(
      v.literal("awaiting_approval"),
      v.literal("rejected"),
      v.literal("approved"),
      v.literal("superseded"),
      v.literal("executing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    version: v.number(),
    previousPlanId: v.optional(v.id("tarlaMealPlans")),
    selectedTemplateId: v.string(),
    selectedTemplateName: v.string(),
    totalServingEquivalents: v.number(),
    totalNutrition: nutrition,
    perServingNutrition: nutrition,
    memberNutrition: v.array(
      v.object({
        memberId: v.id("members"),
        memberName: v.string(),
        servingEquivalent: v.number(),
        nutrition,
      }),
    ),
    constraintChecks: v.array(
      v.object({
        name: v.string(),
        passed: v.boolean(),
        detail: v.string(),
      }),
    ),
    userEscalationRequired: v.boolean(),
    approvedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_household", ["householdId"])
    .index("by_run", ["runId"]),

  tarlaMealPlanItems: defineTable({
    planId: v.id("tarlaMealPlans"),
    recipeId: v.string(),
    recipeName: v.string(),
    scale: v.number(),
    totalNutrition: nutrition,
    perServingNutrition: nutrition,
    ingredients: v.array(
      v.object({
        ingredientKey: v.string(),
        ingredientName: v.string(),
        quantityG: v.number(),
        nutrition,
      }),
    ),
    memberPortions: v.array(
      v.object({
        memberId: v.id("members"),
        memberName: v.string(),
        servingEquivalent: v.number(),
        nutrition,
      }),
    ),
    createdAt: v.number(),
  }).index("by_plan", ["planId"]),

  tarlaUserFeedback: defineTable({
    householdId: v.id("households"),
    planId: v.id("tarlaMealPlans"),
    runId: v.id("agentRuns"),
    memberId: v.id("members"),
    feedbackType: v.union(
      v.literal("approval"),
      v.literal("correction"),
    ),
    rawContent: v.string(),
    interpretation: v.optional(v.string()),
    preferenceId: v.optional(v.id("preferences")),
    createdAt: v.number(),
  })
    .index("by_plan", ["planId"])
    .index("by_run", ["runId"]),

  tarlaExecutions: defineTable({
    householdId: v.id("households"),
    planId: v.optional(v.id("tarlaMealPlans")),
    dayPlanId: v.optional(v.id("tarlaDayPlans")),
    dayPlanSeriesId: v.optional(v.string()),
    cookVisitId: v.optional(v.id("tarlaCookVisits")),
    runId: v.id("agentRuns"),
    cookMemberId: v.id("members"),
    communicationEndpointId: v.id("communicationEndpoints"),
    status: v.union(
      v.literal("scheduled"),
      v.literal("instruction_ready"),
      v.literal("waiting"),
      v.literal("revised_waiting"),
      v.literal("question_received"),
      v.literal("unresolved"),
      v.literal("acknowledged"),
      v.literal("no_response"),
      v.literal("failed"),
      v.literal("completed"),
    ),
    instruction: v.optional(v.string()),
    latestInstruction: v.optional(v.string()),
    outboundMessageId: v.optional(v.string()),
    revisedOutboundMessageId: v.optional(v.string()),
    sentAt: v.optional(v.number()),
    expectedResponseBy: v.optional(v.number()),
    responseTimeoutJobId: v.optional(v.string()),
    scheduledFor: v.optional(v.number()),
    occurrenceKey: v.optional(v.string()),
    scheduledJobId: v.optional(v.string()),
    lockedMealSlots: v.optional(v.array(v.string())),
    latestInboundSignalId: v.optional(v.id("inboundSignals")),
    unavailableIngredientKeys: v.array(v.string()),
    userEscalationRequired: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_household", ["householdId"])
    .index("by_plan", ["planId"])
    .index("by_cook", ["cookMemberId"])
    .index("by_day_plan", ["dayPlanId"])
    .index("by_occurrence_key", ["occurrenceKey"]),

  tarlaInventoryItems: defineTable({
    householdId: v.id("households"),
    ingredientKey: v.string(),
    item: v.string(),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    availability: v.union(
      v.literal("available"),
      v.literal("unavailable"),
      v.literal("unknown"),
    ),
    source: v.union(
      v.literal("user"),
      v.literal("cook"),
      v.literal("tarla"),
    ),
    lastConfirmedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_household", ["householdId"])
    .index("by_household_and_ingredient", ["householdId", "ingredientKey"]),

  shoppingNeededItems: defineTable({
    householdId: v.id("households"),
    tarlaExecutionId: v.optional(v.id("tarlaExecutions")),
    ingredientKey: v.string(),
    item: v.string(),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    reason: v.string(),
    source: v.union(
      v.literal("user"),
      v.literal("cook_missing_ingredient"),
      v.literal("tarla_plan"),
    ),
    status: v.union(
      v.literal("needed"),
      v.literal("acquired"),
      v.literal("dismissed"),
    ),
    addedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_household", ["householdId"])
    .index("by_household_and_ingredient", ["householdId", "ingredientKey"]),

  tarlaMealHistory: defineTable({
    householdId: v.id("households"),
    planId: v.optional(v.id("tarlaMealPlans")),
    targetDate: v.string(),
    mealSlot: v.string(),
    templateId: v.string(),
    recipeIds: v.array(v.string()),
    ingredientKeys: v.array(v.string()),
    active: v.optional(v.boolean()),
    source: v.union(
      v.literal("approved_plan"),
      v.literal("manual"),
    ),
    createdAt: v.number(),
  }).index("by_household", ["householdId"]),

  devTransportMessages: defineTable({
    messageId: v.string(),
    householdId: v.id("households"),
    memberId: v.id("members"),
    communicationEndpointId: v.id("communicationEndpoints"),
    checkInId: v.optional(v.id("checkIns")),
    runId: v.id("agentRuns"),
    routineId: v.optional(v.id("routines")),
    tarlaExecutionId: v.optional(v.id("tarlaExecutions")),
    mealPlanId: v.optional(v.id("tarlaMealPlans")),
    dayPlanId: v.optional(v.id("tarlaDayPlans")),
    cookVisitId: v.optional(v.id("tarlaCookVisits")),
    purpose: v.optional(v.string()),
    recipientAddress: v.string(),
    channel: v.string(),
    message: v.string(),
    sentAt: v.number(),
  })
    .index("by_message_id", ["messageId"])
    .index("by_check_in", ["checkInId"])
    .index("by_tarla_execution", ["tarlaExecutionId"]),

  transportMessages: defineTable({
    messageId: v.string(),
    idempotencyKey: v.string(),
    provider: v.string(),
    providerMessageId: v.optional(v.string()),
    providerStatus: v.optional(v.string()),
    status: v.union(
      v.literal("requested"),
      v.literal("accepted"),
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("read"),
      v.literal("failed"),
    ),
    householdId: v.id("households"),
    memberId: v.id("members"),
    communicationEndpointId: v.id("communicationEndpoints"),
    checkInId: v.optional(v.id("checkIns")),
    runId: v.id("agentRuns"),
    routineId: v.optional(v.id("routines")),
    tarlaExecutionId: v.optional(v.id("tarlaExecutions")),
    mealPlanId: v.optional(v.id("tarlaMealPlans")),
    dayPlanId: v.optional(v.id("tarlaDayPlans")),
    cookVisitId: v.optional(v.id("tarlaCookVisits")),
    purpose: v.optional(v.string()),
    channel: v.string(),
    message: v.string(),
    requestedAt: v.number(),
    providerAcceptedAt: v.optional(v.number()),
    sentAt: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
    readAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    failureCode: v.optional(v.string()),
    failureSummary: v.optional(v.string()),
    scheduledJobId: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_message_id", ["messageId"])
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_provider_message_id", ["providerMessageId"])
    .index("by_endpoint", ["communicationEndpointId"])
    .index("by_check_in", ["checkInId"])
    .index("by_tarla_execution", ["tarlaExecutionId"]),

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
    coordinationMode: v.optional(
      v.union(
        v.literal("senior_directly"),
        v.literal("caretaker"),
        v.literal("both"),
      ),
    ),
    caretakerMemberId: v.optional(v.id("members")),
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
    recipientMemberId: v.optional(v.id("members")),
    recipientAudience: v.optional(
      v.union(v.literal("senior"), v.literal("caretaker")),
    ),
    notes: v.optional(v.string()),
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
