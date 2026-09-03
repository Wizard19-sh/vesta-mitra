import { v } from "convex/values";
import { composeCookPrimingMessage } from "../lib/tarlaMessages";
import { normalizeFoodKey } from "../lib/tarlaIngredientData";
import {
  estimateEnergy,
  type ActivityLevel,
  type NutritionGoal,
} from "../lib/tarlaNutrition";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

const dietaryType = v.union(
  v.literal("vegetarian"),
  v.literal("eggetarian"),
  v.literal("non_vegetarian"),
);

const activityLevel = v.union(
  v.literal("sedentary"),
  v.literal("lightly_active"),
  v.literal("moderately_active"),
  v.literal("very_active"),
  v.literal("extra_active"),
);

const nutritionGoal = v.union(
  v.literal("maintenance"),
  v.literal("deficit_10"),
  v.literal("deficit_20"),
  v.literal("custom"),
);

const ruleType = v.union(
  v.literal("vegetarian_days"),
  v.literal("non_vegetarian_allowed_days"),
  v.literal("ingredient_excluded_days"),
  v.literal("ingredient_frequency_limit"),
  v.literal("avoid_recipe_repeat"),
);

const visitFrequency = v.union(
  v.literal("once_daily"),
  v.literal("twice_daily"),
  v.literal("custom"),
);

export const setHouseholdMealContext = mutation({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
    mealsPreparedAtHome: v.array(v.string()),
    usualMealTimes: v.array(v.object({ meal: v.string(), time: v.string() })),
  },
  handler: async (ctx, args) => {
    await requireHousehold(ctx, args.householdId, args.ownerKey);
    const mealsPreparedAtHome = uniqueTextList(args.mealsPreparedAtHome, "Meal", 40);
    const usualMealTimes = args.usualMealTimes.map(({ meal, time }) => ({
      meal: requiredText(meal, "Meal", 40).toLocaleLowerCase(),
      time: validTime(time),
    }));
    const existing = await ctx.db
      .query("tarlaHouseholdProfiles")
      .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        mealsPreparedAtHome,
        usualMealTimes,
        updatedAt: now,
      });
      return existing._id;
    }
    return ctx.db.insert("tarlaHouseholdProfiles", {
      householdId: args.householdId,
      mealsPreparedAtHome,
      usualMealTimes,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const upsertMemberProfile = mutation({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
    memberId: v.id("members"),
    dietaryType,
    allergies: v.optional(v.array(v.string())),
    dislikedFoods: v.optional(v.array(v.string())),
    avoidedFoods: v.optional(v.array(v.string())),
    limitedFoods: v.optional(v.array(v.string())),
    favouriteFoods: v.optional(v.array(v.string())),
    mealsAtHome: v.optional(v.array(v.string())),
    servingEquivalent: v.optional(v.number()),
    foodContext: v.optional(v.string()),
    cookNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireHousehold(ctx, args.householdId, args.ownerKey);
    await requireMember(ctx, args.memberId, args.householdId);
    if (
      args.servingEquivalent !== undefined &&
      (!Number.isFinite(args.servingEquivalent) || args.servingEquivalent <= 0 || args.servingEquivalent > 5)
    ) {
      throw new Error("Serving equivalent must be greater than 0 and at most 5");
    }
    const existing = await memberProfile(ctx, args.memberId);
    const now = Date.now();
    const lists = {
      allergies: normalizedList(args.allergies, existing?.allergies),
      dislikedFoods: normalizedList(args.dislikedFoods, existing?.dislikedFoods),
      avoidedFoods: normalizedList(args.avoidedFoods, existing?.avoidedFoods),
      limitedFoods: normalizedList(args.limitedFoods, existing?.limitedFoods),
      favouriteFoods: normalizedList(args.favouriteFoods, existing?.favouriteFoods),
      mealsAtHome: uniqueTextList(
        args.mealsAtHome ?? existing?.mealsAtHome ?? [],
        "Meal at home",
        40,
      ),
    };
    if (existing) {
      await ctx.db.patch(existing._id, {
        dietaryType: args.dietaryType,
        ...lists,
        servingEquivalent: args.servingEquivalent ?? existing.servingEquivalent,
        ...(args.foodContext === undefined
          ? {}
          : { foodContext: optionalText(args.foodContext, "Food context", 2_000) }),
        ...(args.cookNotes === undefined
          ? {}
          : { cookNotes: optionalText(args.cookNotes, "Cook notes", 500) }),
        updatedAt: now,
      });
      return existing._id;
    }
    return ctx.db.insert("tarlaMemberProfiles", {
      householdId: args.householdId,
      memberId: args.memberId,
      dietaryType: args.dietaryType,
      ...lists,
      servingEquivalent: args.servingEquivalent ?? 1,
      foodContext: optionalText(args.foodContext, "Food context", 2_000),
      cookNotes: optionalText(args.cookNotes, "Cook notes", 500),
      nutritionRequested: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const estimateMemberNutrition = mutation({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
    memberId: v.id("members"),
    activityLevel,
    goal: nutritionGoal,
    customCalorieTargetKcal: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireHousehold(ctx, args.householdId, args.ownerKey);
    const member = await requireMember(ctx, args.memberId, args.householdId);
    const profile = await memberProfile(ctx, args.memberId);
    if (!profile) throw new Error("Create the Tarla member profile first");
    const sex = nutritionSex(member.sex);
    if (
      member.age === undefined ||
      member.heightCm === undefined ||
      member.weightKg === undefined
    ) {
      throw new Error("Age, height, and weight are required for a nutrition estimate");
    }
    const estimate = estimateEnergy({
      age: member.age,
      sex,
      heightCm: member.heightCm,
      weightKg: member.weightKg,
      activityLevel: args.activityLevel as ActivityLevel,
      goal: args.goal as NutritionGoal,
      customCalorieTargetKcal: args.customCalorieTargetKcal,
    });
    await ctx.db.patch(profile._id, {
      activityLevel: args.activityLevel,
      nutritionRequested: true,
      nutritionEquation: estimate.equation,
      estimatedBmrKcal: estimate.estimatedBmrKcal,
      estimatedTdeeKcal: estimate.estimatedTdeeKcal,
      nutritionGoal: args.goal,
      calorieTargetKcal: estimate.calorieTargetKcal,
      updatedAt: Date.now(),
    });
    return estimate;
  },
});

export const setNutritionTargets = mutation({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
    memberId: v.id("members"),
    calorieTargetKcal: v.optional(v.number()),
    proteinTargetG: v.optional(v.number()),
    fatTargetG: v.optional(v.number()),
    carbohydratesTargetG: v.optional(v.number()),
    fibreTargetG: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireHousehold(ctx, args.householdId, args.ownerKey);
    await requireMember(ctx, args.memberId, args.householdId);
    const profile = await memberProfile(ctx, args.memberId);
    if (!profile) throw new Error("Create the Tarla member profile first");
    const values = [
      args.calorieTargetKcal,
      args.proteinTargetG,
      args.fatTargetG,
      args.carbohydratesTargetG,
      args.fibreTargetG,
    ];
    if (values.every((value) => value === undefined)) {
      throw new Error("At least one nutrition target is required");
    }
    values.forEach((value) => optionalPositive(value, "Nutrition target"));
    await ctx.db.patch(profile._id, {
      ...(args.calorieTargetKcal === undefined
        ? {}
        : {
            calorieTargetKcal: args.calorieTargetKcal,
            nutritionRequested: true,
            nutritionGoal: "custom" as const,
          }),
      ...(args.proteinTargetG === undefined ? {} : { proteinTargetG: args.proteinTargetG }),
      ...(args.fatTargetG === undefined ? {} : { fatTargetG: args.fatTargetG }),
      ...(args.carbohydratesTargetG === undefined
        ? {}
        : { carbohydratesTargetG: args.carbohydratesTargetG }),
      ...(args.fibreTargetG === undefined ? {} : { fibreTargetG: args.fibreTargetG }),
      updatedAt: Date.now(),
    });
    return profile._id;
  },
});

export const addDietaryRule = mutation({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
    memberId: v.optional(v.id("members")),
    ruleType,
    daysOfWeek: v.optional(v.array(v.number())),
    ingredientKey: v.optional(v.string()),
    mealSlot: v.optional(v.string()),
    maxOccurrences: v.optional(v.number()),
    windowDays: v.optional(v.number()),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    await requireHousehold(ctx, args.householdId, args.ownerKey);
    if (args.memberId) await requireMember(ctx, args.memberId, args.householdId);
    const daysOfWeek = args.daysOfWeek;
    if (daysOfWeek?.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
      throw new Error("Days of week must be integers from 0 to 6");
    }
    if (
      ["vegetarian_days", "non_vegetarian_allowed_days", "ingredient_excluded_days"].includes(args.ruleType) &&
      (!daysOfWeek || daysOfWeek.length === 0)
    ) {
      throw new Error("This dietary rule requires at least one day of week");
    }
    if (
      ["ingredient_excluded_days", "ingredient_frequency_limit"].includes(args.ruleType) &&
      !args.ingredientKey
    ) {
      throw new Error("This dietary rule requires an ingredient");
    }
    if (
      args.ruleType === "ingredient_frequency_limit" &&
      (!Number.isInteger(args.maxOccurrences) || !Number.isInteger(args.windowDays) ||
        (args.maxOccurrences ?? 0) < 1 || (args.windowDays ?? 0) < 1)
    ) {
      throw new Error("Frequency limits require positive occurrence and day counts");
    }
    if (
      args.ruleType === "avoid_recipe_repeat" &&
      (!Number.isInteger(args.windowDays) || (args.windowDays ?? 0) < 1)
    ) {
      throw new Error("Recipe repeat rules require a positive day window");
    }
    const now = Date.now();
    return ctx.db.insert("tarlaDietaryRules", {
      householdId: args.householdId,
      memberId: args.memberId,
      ruleType: args.ruleType,
      daysOfWeek: daysOfWeek ? [...new Set(daysOfWeek)] : undefined,
      ingredientKey: args.ingredientKey ? normalizeFoodKey(args.ingredientKey) : undefined,
      mealSlot: optionalText(args.mealSlot, "Meal slot", 40)?.toLocaleLowerCase(),
      maxOccurrences: args.maxOccurrences,
      windowDays: args.windowDays,
      description: requiredText(args.description, "Rule description", 500),
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setTuesdayVegetarianRule = mutation({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireHousehold(ctx, args.householdId, args.ownerKey);
    const rules = await ctx.db
      .query("tarlaDietaryRules")
      .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
      .collect();
    const matching = rules.filter(
      (rule) =>
        rule.ruleType === "vegetarian_days" &&
        rule.memberId === undefined &&
        rule.daysOfWeek?.length === 1 &&
        rule.daysOfWeek[0] === 2,
    );
    const now = Date.now();
    if (!args.active) {
      await Promise.all(
        matching
          .filter((rule) => rule.active)
          .map((rule) => ctx.db.patch(rule._id, { active: false, updatedAt: now })),
      );
      return matching[0]?._id ?? null;
    }
    const existing = matching[0];
    if (existing) {
      await ctx.db.patch(existing._id, {
        active: true,
        description: "Household meals are vegetarian on Tuesday.",
        updatedAt: now,
      });
      return existing._id;
    }
    return ctx.db.insert("tarlaDietaryRules", {
      householdId: args.householdId,
      ruleType: "vegetarian_days",
      daysOfWeek: [2],
      description: "Household meals are vegetarian on Tuesday.",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const reassignCook = mutation({
  args: {
    ownerKey: v.string(),
    cookStateId: v.id("tarlaCookStates"),
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db.get(args.cookStateId);
    if (!state) throw new Error("Cook state not found");
    await requireHousehold(ctx, state.householdId, args.ownerKey);
    await requireMember(ctx, args.memberId, state.householdId);
    if (state.memberId === args.memberId) return state._id;
    const conflict = await ctx.db
      .query("tarlaCookStates")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .unique();
    if (conflict && conflict._id !== state._id) {
      throw new Error("The selected cooking person already has a cook setup");
    }
    const endpoint = await ctx.db.get(state.communicationEndpointId);
    if (!endpoint || endpoint.householdId !== state.householdId) {
      throw new Error("Cook communication endpoint was not found");
    }
    const visits = await ctx.db
      .query("tarlaCookVisits")
      .withIndex("by_cook_state", (q) => q.eq("cookStateId", state._id))
      .collect();
    const now = Date.now();
    await Promise.all([
      ctx.db.patch(state._id, { memberId: args.memberId, updatedAt: now }),
      ctx.db.patch(endpoint._id, { memberId: args.memberId, updatedAt: now }),
      ...visits.map((visit) =>
        ctx.db.patch(visit._id, { cookMemberId: args.memberId, updatedAt: now }),
      ),
    ]);
    return state._id;
  },
});

export const configureCook = mutation({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
    memberId: v.id("members"),
    communicationEndpointId: v.id("communicationEndpoints"),
    usualArrivalTime: v.optional(v.string()),
    cookingConstraints: v.optional(v.string()),
    communicationTone: v.optional(v.string()),
    visitFrequency: v.optional(visitFrequency),
  },
  handler: async (ctx, args) => {
    await requireHousehold(ctx, args.householdId, args.ownerKey);
    await requireMember(ctx, args.memberId, args.householdId);
    // Any household member may be the cooking person. Their relationship and
    // communication tone determine how Tarla speaks; the durable member role
    // should not be rewritten just to satisfy kitchen setup.
    const endpoint = await ctx.db.get(args.communicationEndpointId);
    if (
      !endpoint ||
      endpoint.householdId !== args.householdId ||
      endpoint.memberId !== args.memberId
    ) {
      throw new Error("Cook communication endpoint was not found");
    }
    const existing = await ctx.db
      .query("tarlaCookStates")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .unique();
    const now = Date.now();
    const values = {
      communicationEndpointId: args.communicationEndpointId,
      usualArrivalTime:
        args.usualArrivalTime === undefined ? existing?.usualArrivalTime : validTime(args.usualArrivalTime),
      cookingConstraints:
        args.cookingConstraints === undefined
          ? existing?.cookingConstraints
          : optionalText(args.cookingConstraints, "Cooking constraints", 1_000),
      communicationTone:
        args.communicationTone === undefined
          ? existing?.communicationTone
          : optionalText(args.communicationTone, "Communication tone", 100),
      visitFrequency: args.visitFrequency ?? existing?.visitFrequency,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, values);
      return existing._id;
    }
    return ctx.db.insert("tarlaCookStates", {
      householdId: args.householdId,
      memberId: args.memberId,
      ...values,
      readiness: "not_primed",
      createdAt: now,
    });
  },
});

export const configureCookVisits = mutation({
  args: {
    ownerKey: v.string(),
    cookStateId: v.id("tarlaCookStates"),
    frequency: visitFrequency,
    visits: v.array(
      v.object({
        label: v.string(),
        daysOfWeek: v.array(v.number()),
        arrivalTime: v.string(),
        timezone: v.string(),
        instructionLeadMinutes: v.optional(v.number()),
        mealSlots: v.array(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const cookState = await ctx.db.get(args.cookStateId);
    if (!cookState) throw new Error("Cook state not found");
    const household = await requireHousehold(
      ctx,
      cookState.householdId,
      args.ownerKey,
    );
    if (args.frequency === "once_daily" && args.visits.length !== 1) {
      throw new Error("Once-daily cook setup requires exactly one visit");
    }
    if (args.frequency === "twice_daily" && args.visits.length !== 2) {
      throw new Error("Twice-daily cook setup requires exactly two visits");
    }
    if (args.frequency === "custom" && args.visits.length < 1) {
      throw new Error("Custom cook setup requires at least one visit");
    }
    const normalized = args.visits.map((visit) => {
      if (
        visit.daysOfWeek.length === 0 ||
        visit.daysOfWeek.some(
          (day) => !Number.isInteger(day) || day < 0 || day > 6,
        )
      ) {
        throw new Error("Cook visit days must be integers from 0 to 6");
      }
      if (visit.timezone !== household.timezone) {
        throw new Error("Cook visit timezone must match the household timezone");
      }
      const instructionLeadMinutes = visit.instructionLeadMinutes ?? 30;
      if (
        !Number.isInteger(instructionLeadMinutes) ||
        instructionLeadMinutes < 0 ||
        instructionLeadMinutes > 24 * 60
      ) {
        throw new Error("Instruction lead time must be 0 to 1440 minutes");
      }
      const mealSlots = uniqueTextList(visit.mealSlots, "Visit meal", 40);
      if (mealSlots.length === 0) {
        throw new Error("Every cook visit must handle at least one meal");
      }
      return {
        label: requiredText(visit.label, "Visit label", 80),
        daysOfWeek: [...new Set(visit.daysOfWeek)],
        arrivalTime: validTime(visit.arrivalTime),
        timezone: visit.timezone,
        instructionLeadMinutes,
        mealSlots,
      };
    });
    const existing = await ctx.db
      .query("tarlaCookVisits")
      .withIndex("by_cook_state", (q) => q.eq("cookStateId", cookState._id))
      .collect();
    const now = Date.now();
    const activeExisting = existing.filter((visit) => visit.active);
    const unchanged =
      cookState.visitFrequency === args.frequency &&
      activeExisting.length === normalized.length &&
      activeExisting.every((visit, index) => {
        const expected = normalized[index];
        return (
          expected !== undefined &&
          visit.label === expected.label &&
          JSON.stringify(visit.daysOfWeek) === JSON.stringify(expected.daysOfWeek) &&
          visit.arrivalTime === expected.arrivalTime &&
          visit.timezone === expected.timezone &&
          visit.instructionLeadMinutes === expected.instructionLeadMinutes &&
          JSON.stringify(visit.mealSlots) === JSON.stringify(expected.mealSlots)
        );
      });
    if (unchanged) {
      return {
        frequency: args.frequency,
        visitIds: activeExisting.map((visit) => visit._id),
      };
    }
    await Promise.all(
      activeExisting
        .map((visit) => ctx.db.patch(visit._id, { active: false, updatedAt: now })),
    );
    const visitIds = await Promise.all(
      normalized.map((visit) =>
        ctx.db.insert("tarlaCookVisits", {
          householdId: cookState.householdId,
          cookStateId: cookState._id,
          cookMemberId: cookState.memberId,
          ...visit,
          active: true,
          createdAt: now,
          updatedAt: now,
        }),
      ),
    );
    await ctx.db.patch(cookState._id, {
      visitFrequency: args.frequency,
      updatedAt: now,
    });
    return { frequency: args.frequency, visitIds };
  },
});

export const generateCookPriming = mutation({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
    cookMemberId: v.id("members"),
    householdUserMemberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    await requireHousehold(ctx, args.householdId, args.ownerKey);
    const [cook, householdUser, cookState] = await Promise.all([
      requireMember(ctx, args.cookMemberId, args.householdId),
      requireMember(ctx, args.householdUserMemberId, args.householdId),
      ctx.db
        .query("tarlaCookStates")
        .withIndex("by_member", (q) => q.eq("memberId", args.cookMemberId))
        .unique(),
    ]);
    if (!cookState) throw new Error("Configure the cook before generating priming text");
    const endpoint = await ctx.db.get(cookState.communicationEndpointId);
    if (!endpoint) throw new Error("Cook communication endpoint was not found");
    const primingMessage = composeCookPrimingMessage({
      cookName: cook.name,
      householdUserName: householdUser.name,
      preferredLanguage: endpoint.preferredLanguage ?? cook.languagePreference,
      communicationTone: cookState.communicationTone,
    });
    const now = Date.now();
    await ctx.db.patch(cookState._id, {
      primingMessage,
      primingGeneratedAt: now,
      readiness:
        cookState.readiness === "primed" || cookState.readiness === "ready"
          ? cookState.readiness
          : "priming_generated",
      updatedAt: now,
    });
    return { cookStateId: cookState._id, primingMessage };
  },
});

export const setCookReadiness = mutation({
  args: {
    ownerKey: v.string(),
    cookStateId: v.id("tarlaCookStates"),
    readiness: v.union(v.literal("primed"), v.literal("ready")),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db.get(args.cookStateId);
    if (!state) throw new Error("Cook state not found");
    await requireHousehold(ctx, state.householdId, args.ownerKey);
    if (!state.primingMessage) {
      throw new Error("Generate the cook priming message first");
    }
    const now = Date.now();
    await ctx.db.patch(state._id, {
      readiness: args.readiness,
      primedAt: state.primedAt ?? now,
      readyAt: args.readiness === "ready" ? now : state.readyAt,
      updatedAt: now,
    });
    return state._id;
  },
});

export const setInventoryItem = mutation({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
    ingredient: v.string(),
    item: v.optional(v.string()),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    availability: v.union(
      v.literal("available"),
      v.literal("unavailable"),
      v.literal("unknown"),
    ),
    source: v.union(v.literal("user"), v.literal("cook"), v.literal("tarla")),
  },
  handler: async (ctx, args) => {
    await requireHousehold(ctx, args.householdId, args.ownerKey);
    optionalPositive(args.quantity, "Inventory quantity");
    const ingredientKey = normalizeFoodKey(args.ingredient);
    const now = Date.now();
    const existing = await ctx.db
      .query("tarlaInventoryItems")
      .withIndex("by_household_and_ingredient", (q) =>
        q.eq("householdId", args.householdId).eq("ingredientKey", ingredientKey),
      )
      .unique();
    const values = {
      item: requiredText(args.item ?? args.ingredient, "Inventory item", 120),
      quantity: args.quantity,
      unit: optionalText(args.unit, "Inventory unit", 40),
      availability: args.availability,
      source: args.source,
      lastConfirmedAt: now,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, values);
      return existing._id;
    }
    return ctx.db.insert("tarlaInventoryItems", {
      householdId: args.householdId,
      ingredientKey,
      ...values,
      createdAt: now,
    });
  },
});

export const recordMealHistory = mutation({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
    targetDate: v.string(),
    mealSlot: v.string(),
    templateId: v.string(),
    recipeIds: v.array(v.string()),
    ingredientKeys: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireHousehold(ctx, args.householdId, args.ownerKey);
    validDate(args.targetDate);
    return ctx.db.insert("tarlaMealHistory", {
      householdId: args.householdId,
      targetDate: args.targetDate,
      mealSlot: requiredText(args.mealSlot, "Meal slot", 40).toLocaleLowerCase(),
      templateId: requiredText(args.templateId, "Template ID", 120),
      recipeIds: uniqueTextList(args.recipeIds, "Recipe ID", 120),
      ingredientKeys: [...new Set(args.ingredientKeys.map(normalizeFoodKey))],
      active: true,
      source: "manual",
      createdAt: Date.now(),
    });
  },
});

export const getTarlaContext = query({
  args: { ownerKey: v.string(), householdId: v.id("households") },
  handler: async (ctx, args) => {
    const household = await requireHousehold(ctx, args.householdId, args.ownerKey);
    const [householdProfile, members, memberProfiles, preferences, rules, cooks, cookVisits, inventory, shopping] =
      await Promise.all([
        ctx.db
          .query("tarlaHouseholdProfiles")
          .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
          .unique(),
        ctx.db
          .query("members")
          .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
          .collect(),
        ctx.db
          .query("tarlaMemberProfiles")
          .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
          .collect(),
        ctx.db
          .query("preferences")
          .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
          .collect(),
        ctx.db
          .query("tarlaDietaryRules")
          .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
          .collect(),
        ctx.db
          .query("tarlaCookStates")
          .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
          .collect(),
        ctx.db
          .query("tarlaCookVisits")
          .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
          .collect(),
        ctx.db
          .query("tarlaInventoryItems")
          .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
          .collect(),
        ctx.db
          .query("shoppingNeededItems")
          .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
          .collect(),
      ]);
    const now = Date.now();
    return {
      household,
      householdProfile,
      members,
      memberProfiles,
      preferences: preferences.filter(
        (item) => item.active && (item.expiresAt === undefined || item.expiresAt > now),
      ),
      dietaryRules: rules.filter((item) => item.active),
      cooks,
      cookVisits: cookVisits.filter((visit) => visit.active),
      inventory,
      shopping,
    };
  },
});

async function memberProfile(ctx: MutationCtx | QueryCtx, memberId: Id<"members">) {
  return ctx.db
    .query("tarlaMemberProfiles")
    .withIndex("by_member", (q) => q.eq("memberId", memberId))
    .unique();
}

async function requireHousehold(
  ctx: MutationCtx | QueryCtx,
  householdId: Id<"households">,
  ownerKey: string,
) {
  const household = await ctx.db.get(householdId);
  if (!household || household.ownerKey !== ownerKey) throw new Error("Household not found");
  return household;
}

async function requireMember(
  ctx: MutationCtx | QueryCtx,
  memberId: Id<"members">,
  householdId: Id<"households">,
) {
  const member = await ctx.db.get(memberId);
  if (!member || member.householdId !== householdId) {
    throw new Error("Member not found in household");
  }
  return member;
}

function nutritionSex(value: string | undefined): "male" | "female" {
  if (/^(male|m)$/i.test(value ?? "")) return "male";
  if (/^(female|f)$/i.test(value ?? "")) return "female";
  throw new Error("A male or female sex value is required by this estimate equation");
}

function normalizedList(value: string[] | undefined, fallback: string[] | undefined) {
  if (value === undefined) return fallback ?? [];
  return [...new Set(value.map(normalizeFoodKey).filter(Boolean))];
}

function uniqueTextList(values: string[], label: string, maxLength: number) {
  return [...new Set(values.map((value) => requiredText(value, label, maxLength).toLocaleLowerCase()))];
}

function requiredText(value: string, label: string, maxLength: number) {
  const clean = value.trim();
  if (!clean) throw new Error(`${label} is required`);
  if (clean.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer`);
  return clean;
}

function optionalText(value: string | undefined, label: string, maxLength: number) {
  if (value === undefined) return undefined;
  const clean = value.trim();
  if (!clean) return undefined;
  if (clean.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer`);
  return clean;
}

function optionalPositive(value: number | undefined, label: string) {
  if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
    throw new Error(`${label} must be a positive number`);
  }
}

function validTime(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error("Meal and arrival times must use 24-hour HH:mm format");
  }
  return value;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error("Date must use YYYY-MM-DD format");
  }
}
