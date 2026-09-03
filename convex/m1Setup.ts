import { v } from "convex/values";
import {
  buildRoutineTiming,
  composeCookIntroduction,
  composeMitraMessage,
  isNutritionEstimateSupported,
  roleForMember,
  to24Hour,
  type AeviaSetupPayload,
  type HouseholdMemberDraft,
  type MitraRoutineDraft,
} from "../lib/aeviaSetup";
import { firstOccurrenceAt, legacyScheduleFromTiming } from "../lib/mitraSchedule";
import { estimateEnergy, type NutritionGoal } from "../lib/tarlaNutrition";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation } from "./_generated/server";

export const saveSetup = mutation({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
    setup: v.any(),
  },
  handler: async (ctx, args) => {
    const household = await requireHousehold(ctx, args.householdId, args.ownerKey);
    const profile = await ctx.db
      .query("betaUserProfiles")
      .withIndex("by_owner", (q) => q.eq("ownerKey", args.ownerKey))
      .unique();
    if (!profile || profile.householdId !== household._id) {
      throw new Error("Aevia setup was not found");
    }
    const setup = args.setup as AeviaSetupPayload;
    validateSetup(setup);
    const now = Date.now();
    const memberIds = new Map<string, Id<"members">>();

    for (const input of setup.members) {
      const clean = cleanMember(input);
      let memberId: Id<"members">;
      if (input.memberId) {
        memberId = input.memberId as Id<"members">;
        const member = await ctx.db.get(memberId);
        if (!member || member.householdId !== household._id) {
          throw new Error("A household member could not be updated");
        }
        if (input.isPrimary && memberId !== profile.memberId) {
          throw new Error("The primary household member cannot be replaced");
        }
        await ctx.db.patch(memberId, { ...clean, updatedAt: now });
      } else {
        if (input.isPrimary) throw new Error("The primary member is missing its saved ID");
        memberId = await ctx.db.insert("members", {
          householdId: household._id,
          ...clean,
          createdAt: now,
          updatedAt: now,
        });
      }
      memberIds.set(input.clientKey, memberId);
    }

    if (![...memberIds.values()].some((memberId) => memberId === profile.memberId)) {
      throw new Error("The primary household member must stay in the household");
    }

    for (const rawMemberId of setup.removedMemberIds) {
      const memberId = rawMemberId as Id<"members">;
      if (memberId === profile.memberId) continue;
      const member = await ctx.db.get(memberId);
      if (!member || member.householdId !== household._id) continue;
      await deactivateMember(ctx, household._id, memberId, now);
    }

    await replacePreference(ctx, {
      householdId: household._id,
      category: "household_setup",
      key: "specialists",
      value: setup.agentChoice,
      now,
    });
    await replacePreference(ctx, {
      householdId: household._id,
      category: "household_context",
      key: "user_provided_context",
      value: setup.anythingElse,
      now,
    });

    const mitraResult = await saveMitra(
      ctx,
      args.ownerKey,
      household,
      profile,
      setup,
      memberIds,
      now,
    );
    const tarlaResult = await saveTarla(
      ctx,
      args.ownerKey,
      household,
      setup,
      memberIds,
      now,
    );

    return {
      memberIds: [...memberIds].map(([clientKey, memberId]) => ({ clientKey, memberId })),
      mitraRoutineIds: mitraResult,
      eaterMemberIds: tarlaResult.eaterMemberIds,
      cookingPeople: tarlaResult.cookingPeople,
    };
  },
});

async function saveMitra(
  ctx: MutationCtx,
  ownerKey: string,
  household: Doc<"households">,
  profile: Doc<"betaUserProfiles">,
  setup: AeviaSetupPayload,
  memberIds: Map<string, Id<"members">>,
  now: number,
) {
  const existingRoutines = await ctx.db
    .query("routines")
    .withIndex("by_household", (q) => q.eq("householdId", household._id))
    .collect();
  if (setup.agentChoice === "tarla") {
    await Promise.all(existingRoutines.map((routine) => disableRoutine(ctx, routine, now)));
    return [];
  }
  const primaryMember = await ctx.db.get(profile.memberId);
  if (!primaryMember) throw new Error("Primary household member not found");
  const keptRoutineIds = new Set<string>();
  const result: Array<{ routineId: Id<"routines">; memberId: Id<"members"> }> = [];

  for (const person of setup.mitraPeople) {
    const memberId = requiredMappedMember(memberIds, person.memberClientKey);
    const member = await ctx.db.get(memberId);
    if (!member || member.householdId !== household._id) {
      throw new Error("Mitra person not found");
    }
    if (member.lifeStage !== "senior" && member.lifeStage !== "adult") {
      throw new Error("Mitra can currently be set up only for an adult or senior");
    }
    if (!person.consentConfirmed) {
      throw new Error(`${member.name} must agree to receive the selected routine messages`);
    }
    const caretakerMemberId = person.caretakerMemberClientKey
      ? requiredMappedMember(memberIds, person.caretakerMemberClientKey)
      : undefined;
    if (
      (person.communicationPath === "caretaker" || person.communicationPath === "both") &&
      !caretakerMemberId
    ) {
      throw new Error(`Choose who Mitra should coordinate with for ${member.name}`);
    }

    const parent = await upsertParent(ctx, {
      ownerKey,
      householdId: household._id,
      member,
      parentId: person.parentId as Id<"parents"> | undefined,
      primaryName: primaryMember.name,
      coordinationMode: person.communicationPath,
      caretakerMemberId,
    });
    await upsertMitraReadiness(ctx, household._id, memberId, now);

    const directEndpointId =
      person.communicationPath === "senior_directly" || person.communicationPath === "both"
        ? await upsertEndpoint(ctx, {
            householdId: household._id,
            memberId,
            address: person.directPhone,
            language: member.languagePreference ?? "English",
            consentGranted: true,
            now,
          })
        : undefined;
    const caretaker = caretakerMemberId ? await ctx.db.get(caretakerMemberId) : undefined;
    const caretakerEndpointId =
      person.communicationPath === "caretaker" || person.communicationPath === "both"
        ? await upsertEndpoint(ctx, {
            householdId: household._id,
            memberId: caretakerMemberId!,
            address: person.caretakerPhone,
            language: caretaker?.languagePreference ?? "English",
            consentGranted: true,
            now,
          })
        : undefined;
    const recipientMemberId =
      person.communicationPath === "caretaker" ? caretakerMemberId! : memberId;
    const recipientEndpointId =
      person.communicationPath === "caretaker" ? caretakerEndpointId! : directEndpointId!;
    const recipient = await ctx.db.get(recipientMemberId);
    if (!recipient) throw new Error("Mitra recipient not found");

    for (const routineInput of person.routines) {
      const timing = buildRoutineTiming(routineInput, household.timezone);
      const message = composeMitraMessage({
        context: {
          agent: "mitra",
          audience: person.communicationPath === "caretaker" ? "caretaker" : "senior",
          surface: "whatsapp",
          moment: "reminder",
        },
        recipientSalutation:
          recipient.preferredSalutation?.trim() || recipient.name,
        seniorSalutation: member.preferredSalutation?.trim() || member.name,
        label: requiredText(routineInput.label, "Routine label", 160),
        type: routineInput.type,
        language: supportedLanguage(recipient.languagePreference),
      });
      const saved = await upsertRoutine(ctx, {
        ownerKey,
        household,
        memberId,
        parentId: parent._id,
        recipientMemberId,
        recipientAudience:
          person.communicationPath === "caretaker" ? "caretaker" : "senior",
        endpointId: recipientEndpointId,
        input: routineInput,
        timing,
        customMessage: message,
        now,
      });
      keptRoutineIds.add(String(saved));
      result.push({ routineId: saved, memberId });
    }
  }

  await Promise.all(
    existingRoutines
      .filter((routine) => routine.w2Enabled && !keptRoutineIds.has(String(routine._id)))
      .map((routine) => disableRoutine(ctx, routine, now)),
  );
  return result;
}

async function saveTarla(
  ctx: MutationCtx,
  ownerKey: string,
  household: Doc<"households">,
  setup: AeviaSetupPayload,
  memberIds: Map<string, Id<"members">>,
  now: number,
) {
  const profiles = await ctx.db
    .query("tarlaMemberProfiles")
    .withIndex("by_household", (q) => q.eq("householdId", household._id))
    .collect();
  const cookStates = await ctx.db
    .query("tarlaCookStates")
    .withIndex("by_household", (q) => q.eq("householdId", household._id))
    .collect();
  if (setup.agentChoice === "mitra") {
    await Promise.all([
      ...profiles.map((profile) => ctx.db.patch(profile._id, { includedInPlanning: false, updatedAt: now })),
      ...cookStates.map((state) => ctx.db.patch(state._id, { active: false, updatedAt: now })),
    ]);
    return { eaterMemberIds: [] as Id<"members">[], cookingPeople: [] };
  }

  const tarla = setup.tarla;
  if (!tarla.eaterMemberClientKeys.length) {
    throw new Error("Choose at least one person for Tarla to plan for");
  }
  const eaterMemberIds = tarla.eaterMemberClientKeys.map((key) =>
    requiredMappedMember(memberIds, key),
  );
  const eaterSet = new Set(eaterMemberIds.map(String));
  const nutritionByMember = new Map(
    tarla.nutritionPeople.map((item) => [
      String(requiredMappedMember(memberIds, item.memberClientKey)),
      item,
    ]),
  );

  for (const existing of profiles) {
    if (!eaterSet.has(String(existing.memberId))) {
      await ctx.db.patch(existing._id, {
        includedInPlanning: false,
        nutritionRequested: false,
        planningGoal: "balanced",
        updatedAt: now,
      });
    }
  }

  for (const memberId of eaterMemberIds) {
    const member = await ctx.db.get(memberId);
    if (!member || member.householdId !== household._id) {
      throw new Error("Tarla household member not found");
    }
    const existing = profiles.find((profile) => profile.memberId === memberId);
    const servingEquivalent = member.lifeStage === "child" ? 0.6 : 1;
    const basePatch = {
      dietaryType: tarla.dietaryType,
      allergies: uniqueTextList(tarla.allergies),
      dislikedFoods: uniqueTextList(tarla.dislikedFoods),
      avoidedFoods: uniqueTextList(tarla.hardRestrictions),
      limitedFoods: [] as string[],
      favouriteFoods: uniqueTextList(tarla.favouriteFoods),
      mealsAtHome: ["breakfast", "lunch", "snack", "dinner"],
      servingEquivalent,
      includedInPlanning: true,
      foodContext: optionalText(
        [tarla.foodContext, ...tarla.softerPreferences].filter(Boolean).join(". "),
        2_000,
      ),
      updatedAt: now,
    };
    const profileId = existing?._id ??
      (await ctx.db.insert("tarlaMemberProfiles", {
        householdId: household._id,
        memberId,
        ...basePatch,
        nutritionRequested: false,
        planningGoal: "balanced",
        createdAt: now,
      }));
    if (existing) await ctx.db.patch(profileId, basePatch);

    const nutrition = nutritionByMember.get(String(memberId));
    const draft = setup.members.find((item) => memberIds.get(item.clientKey) === memberId)!;
    if (
      tarla.nutritionMode !== "nutrition_goal" ||
      !nutrition?.enabled ||
      !isNutritionEstimateSupported(draft)
    ) {
      await clearNutrition(ctx, profileId, memberId, now);
      continue;
    }
    if (
      nutrition.age === undefined ||
      !nutrition.sex ||
      nutrition.heightCm === undefined ||
      nutrition.weightKg === undefined ||
      !nutrition.activityLevel
    ) {
      throw new Error(`Complete the nutrition details for ${member.name}`);
    }
    await ctx.db.patch(memberId, {
      age: nutrition.age,
      sex: nutrition.sex,
      heightCm: nutrition.heightCm,
      weightKg: nutrition.weightKg,
      updatedAt: now,
    });
    const mappedGoal: NutritionGoal =
      nutrition.goal === "moderate_deficit"
        ? "deficit_10"
        : nutrition.goal === "stronger_deficit"
          ? "deficit_20"
          : nutrition.goal === "custom"
            ? "custom"
            : "maintenance";
    const estimate = estimateEnergy({
      age: nutrition.age,
      sex: nutrition.sex,
      heightCm: nutrition.heightCm,
      weightKg: nutrition.weightKg,
      activityLevel: nutrition.activityLevel,
      goal: mappedGoal,
      customCalorieTargetKcal:
        nutrition.goal === "custom" ? nutrition.customCalorieTargetKcal : undefined,
    });
    await ctx.db.patch(profileId, {
      activityLevel: nutrition.activityLevel,
      nutritionRequested: true,
      nutritionEquation: estimate.equation,
      estimatedBmrKcal: estimate.estimatedBmrKcal,
      estimatedTdeeKcal: estimate.estimatedTdeeKcal,
      nutritionGoal: mappedGoal,
      planningGoal: nutrition.goal,
      calorieTargetKcal: estimate.calorieTargetKcal,
      proteinTargetG:
        nutrition.customProteinTargetG ??
        (nutrition.goal === "high_protein" ? Math.round(nutrition.weightKg * 1.6) : undefined),
      updatedAt: now,
    });
  }

  await setHouseholdMealContext(ctx, household._id, now);
  await replacePreference(ctx, { householdId: household._id, category: "tarla_onboarding", key: "cuisines", value: tarla.cuisines.join(", "), now });
  await replacePreference(ctx, { householdId: household._id, category: "tarla_onboarding", key: "favourite_foods", value: tarla.favouriteFoods.join(", "), now });
  await replacePreference(ctx, { householdId: household._id, category: "tarla_onboarding", key: "softer_preferences", value: tarla.softerPreferences.join(", "), now });
  await replacePreference(ctx, { householdId: household._id, category: "tarla_onboarding", key: "hard_restrictions", value: [...tarla.allergies, ...tarla.hardRestrictions].join(", "), now });
  await replacePreference(ctx, { householdId: household._id, category: "tarla_onboarding", key: "food_context", value: tarla.foodContext, now });
  await saveFoodRules(ctx, household._id, tarla.rules, now);
  const cookingPeople = await saveCookingPeople(
    ctx,
    household,
    setup,
    memberIds,
    cookStates,
    now,
  );
  return { eaterMemberIds, cookingPeople };
}

async function saveCookingPeople(
  ctx: MutationCtx,
  household: Doc<"households">,
  setup: AeviaSetupPayload,
  memberIds: Map<string, Id<"members">>,
  existingStates: Doc<"tarlaCookStates">[],
  now: number,
) {
  const kept = new Set<string>();
  const result = [];
  for (const input of setup.tarla.cookingPeople) {
    const memberId = requiredMappedMember(memberIds, input.memberClientKey);
    const member = await ctx.db.get(memberId);
    if (!member) throw new Error("Cooking person not found");
    const endpointId = await upsertEndpoint(ctx, {
      householdId: household._id,
      memberId,
      address: input.phone,
      language: input.preferredLanguage,
      consentGranted: input.consentConfirmed,
      now,
    });
    const existing = input.cookStateId
      ? existingStates.find((state) => String(state._id) === input.cookStateId)
      : existingStates.find((state) => state.memberId === memberId);
    const primingMessage = composeCookIntroduction({
      cookName: member.preferredSalutation?.trim() || member.name,
      language: input.preferredLanguage,
      relationshipType: input.relationshipType,
    });
    const statePatch = {
      memberId,
      communicationEndpointId: endpointId,
      usualArrivalTime: input.visits[0] ? to24Hour(input.visits[0].time12) : undefined,
      communicationTone:
        input.relationshipType === "family_cook" || input.relationshipType === "primary_user"
          ? "warm household"
          : "warm and respectful",
      relationshipType: input.relationshipType,
      visitFrequency:
        input.visits.length === 1 ? ("once_daily" as const) : input.visits.length === 2 ? ("twice_daily" as const) : ("custom" as const),
      readiness: input.consentConfirmed ? ("ready" as const) : ("priming_generated" as const),
      primingMessage,
      primingGeneratedAt: now,
      primedAt: input.consentConfirmed ? now : undefined,
      readyAt: input.consentConfirmed ? now : undefined,
      active: true,
      updatedAt: now,
    };
    const cookStateId = existing?._id ??
      (await ctx.db.insert("tarlaCookStates", {
        householdId: household._id,
        ...statePatch,
        createdAt: now,
      }));
    if (existing) await ctx.db.patch(existing._id, statePatch);
    kept.add(String(cookStateId));

    const existingVisits = await ctx.db
      .query("tarlaCookVisits")
      .withIndex("by_cook_state", (q) => q.eq("cookStateId", cookStateId))
      .collect();
    await Promise.all(
      existingVisits.filter((visit) => visit.active).map((visit) =>
        ctx.db.patch(visit._id, { active: false, updatedAt: now }),
      ),
    );
    const visitIds = [];
    for (const visit of input.visits) {
      if (!visit.daysOfWeek.length) throw new Error("Choose at least one cooking day");
      visitIds.push(
        await ctx.db.insert("tarlaCookVisits", {
          householdId: household._id,
          cookStateId,
          cookMemberId: memberId,
          label: requiredText(visit.label, "Cooking visit", 100),
          daysOfWeek: [...new Set(visit.daysOfWeek)].sort(),
          arrivalTime: to24Hour(visit.time12),
          timezone: household.timezone,
          instructionLeadMinutes: 30,
          mealSlots: uniqueTextList(visit.mealSlots),
          active: true,
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    result.push({ cookStateId, endpointId, memberId, visitIds, primingMessage, relationshipType: input.relationshipType });
  }
  await Promise.all(
    existingStates
      .filter((state) => state.active !== false && !kept.has(String(state._id)))
      .map((state) => ctx.db.patch(state._id, { active: false, updatedAt: now })),
  );
  return result;
}

async function upsertRoutine(
  ctx: MutationCtx,
  args: {
    ownerKey: string;
    household: Doc<"households">;
    memberId: Id<"members">;
    parentId: Id<"parents">;
    recipientMemberId: Id<"members">;
    recipientAudience: "senior" | "caretaker";
    endpointId: Id<"communicationEndpoints">;
    input: MitraRoutineDraft;
    timing: ReturnType<typeof buildRoutineTiming>;
    customMessage: string;
    now: number;
  },
) {
  const nextOccurrenceAt = firstOccurrenceAt(args.timing);
  const existing = args.input.routineId
    ? await ctx.db.get(args.input.routineId as Id<"routines">)
    : null;
  const patch = {
    ownerKey: args.ownerKey,
    parentId: args.parentId,
    householdId: args.household._id,
    memberId: args.memberId,
    recipientMemberId: args.recipientMemberId,
    recipientAudience: args.recipientAudience,
    communicationEndpointId: args.endpointId,
    type: args.input.type,
    topics: [args.input.type],
    customTopic: args.input.type === "Custom" ? args.input.label.trim() : undefined,
    frequency: legacyFrequency(args.timing),
    schedule: legacyScheduleFromTiming(args.timing, nextOccurrenceAt),
    prompt: args.customMessage,
    w2Enabled: true,
    label: args.input.label.trim(),
    notes: optionalText(args.input.notes, 1_000),
    timing: args.timing,
    responseWindowMs: 4 * 60 * 60 * 1_000,
    nextOccurrenceAt,
    updatedAt: args.now,
  };
  if (existing) {
    if (existing.ownerKey !== args.ownerKey || existing.householdId !== args.household._id) {
      throw new Error("Mitra routine not found");
    }
    const scheduleChanged =
      JSON.stringify(existing.timing) !== JSON.stringify(args.timing) ||
      existing.communicationEndpointId !== args.endpointId ||
      !existing.w2Enabled;
    if (scheduleChanged && existing.scheduledJobId) {
      await ctx.scheduler.cancel(existing.scheduledJobId as Id<"_scheduled_functions">);
    }
    const scheduledJobId = scheduleChanged
      ? await ctx.scheduler.runAt(nextOccurrenceAt, internal.mitraRuntime.triggerRoutine, {
          routineId: existing._id,
          scheduledFor: nextOccurrenceAt,
        })
      : existing.scheduledJobId;
    await ctx.db.patch(existing._id, {
      ...patch,
      scheduledJobId: scheduledJobId ? String(scheduledJobId) : existing.scheduledJobId,
    });
    return existing._id;
  }
  const routineId = await ctx.db.insert("routines", {
    ...patch,
    createdAt: args.now,
  });
  const scheduledJobId = await ctx.scheduler.runAt(
    nextOccurrenceAt,
    internal.mitraRuntime.triggerRoutine,
    { routineId, scheduledFor: nextOccurrenceAt },
  );
  await ctx.db.patch(routineId, { scheduledJobId: String(scheduledJobId) });
  return routineId;
}

async function upsertParent(
  ctx: MutationCtx,
  args: {
    ownerKey: string;
    householdId: Id<"households">;
    member: Doc<"members">;
    parentId?: Id<"parents">;
    primaryName: string;
    coordinationMode: "senior_directly" | "caretaker" | "both";
    caretakerMemberId?: Id<"members">;
  },
) {
  const existing = args.parentId
    ? await ctx.db.get(args.parentId)
    : await ctx.db
        .query("parents")
        .withIndex("by_member", (q) => q.eq("memberId", args.member._id))
        .first();
  const patch = {
    ownerKey: args.ownerKey,
    householdId: args.householdId,
    memberId: args.member._id,
    name: args.member.name,
    relationship: legacyRelationship(args.member.relationship),
    childDisplayName: args.primaryName,
    salutation: args.member.preferredSalutation?.trim() || args.member.name,
    preferredLanguage: supportedLanguage(args.member.languagePreference),
    communicationPreference: "Text" as const,
    conversationStyle: "Warm & caring" as const,
    primaryIntent: "ROUTINES" as const,
    coordinationMode: args.coordinationMode,
    caretakerMemberId: args.caretakerMemberId,
  };
  if (existing) {
    if (existing.ownerKey !== args.ownerKey) throw new Error("Mitra person not found");
    await ctx.db.patch(existing._id, patch);
    return { ...existing, ...patch };
  }
  const parentId = await ctx.db.insert("parents", patch);
  return { _id: parentId, ...patch };
}

async function upsertEndpoint(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    memberId: Id<"members">;
    address: string;
    language: string;
    consentGranted: boolean;
    now: number;
  },
) {
  const address = validPhone(args.address);
  const endpoints = await ctx.db
    .query("communicationEndpoints")
    .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
    .collect();
  const existing = endpoints.find((endpoint) => endpoint.channel === "whatsapp");
  const patch = {
    memberId: args.memberId,
    channel: "whatsapp",
    address,
    preferredLanguage: supportedLanguage(args.language),
    preferredMode: "text" as const,
    active: true,
    consentStatus: args.consentGranted ? ("granted" as const) : ("pending" as const),
    verifiedAt: args.consentGranted ? args.now : undefined,
    updatedAt: args.now,
  };
  if (existing) {
    await ctx.db.patch(existing._id, patch);
    return existing._id;
  }
  return ctx.db.insert("communicationEndpoints", {
    householdId: args.householdId,
    ...patch,
    providerMetadata: { provider: "development", ready: args.consentGranted },
    createdAt: args.now,
  });
}

async function saveFoodRules(
  ctx: MutationCtx,
  householdId: Id<"households">,
  rules: AeviaSetupPayload["tarla"]["rules"],
  now: number,
) {
  const existing = await ctx.db
    .query("tarlaDietaryRules")
    .withIndex("by_household", (q) => q.eq("householdId", householdId))
    .collect();
  const kept = new Set<string>();
  for (const input of rules) {
    if (!input.daysOfWeek.length) throw new Error("Choose at least one day for each food rule");
    const description = requiredText(input.description, "Food rule", 300);
    const expiresAt = input.temporary
      ? endOfLocalDay(input.expiresOn)
      : undefined;
    if (input.temporary && (!expiresAt || expiresAt <= now)) {
      throw new Error("A temporary food rule needs a future end date");
    }
    const classification = classifyFoodRule(description);
    const patch = {
      ruleType: classification.ruleType,
      daysOfWeek: [...new Set(input.daysOfWeek)].sort(),
      ingredientKey: classification.ingredientKey,
      description,
      active: true,
      expiresAt,
      updatedAt: now,
    };
    const stored = input.ruleId
      ? existing.find((item) => String(item._id) === input.ruleId)
      : undefined;
    const ruleId = stored?._id ??
      (await ctx.db.insert("tarlaDietaryRules", {
        householdId,
        ...patch,
        createdAt: now,
      }));
    if (stored) await ctx.db.patch(stored._id, patch);
    kept.add(String(ruleId));
  }
  await Promise.all(
    existing
      .filter((item) => item.active && !kept.has(String(item._id)))
      .map((item) => ctx.db.patch(item._id, { active: false, updatedAt: now })),
  );
}

async function setHouseholdMealContext(
  ctx: MutationCtx,
  householdId: Id<"households">,
  now: number,
) {
  const existing = await ctx.db
    .query("tarlaHouseholdProfiles")
    .withIndex("by_household", (q) => q.eq("householdId", householdId))
    .unique();
  const patch = {
    mealsPreparedAtHome: ["breakfast", "lunch", "snack", "dinner"],
    usualMealTimes: [
      { meal: "breakfast", time: "08:30" },
      { meal: "lunch", time: "13:00" },
      { meal: "snack", time: "16:30" },
      { meal: "dinner", time: "20:00" },
    ],
    updatedAt: now,
  };
  if (existing) return ctx.db.patch(existing._id, patch);
  return ctx.db.insert("tarlaHouseholdProfiles", {
    householdId,
    ...patch,
    createdAt: now,
  });
}

async function clearNutrition(
  ctx: MutationCtx,
  profileId: Id<"tarlaMemberProfiles">,
  memberId: Id<"members">,
  now: number,
) {
  await Promise.all([
    ctx.db.patch(profileId, {
      activityLevel: undefined,
      nutritionRequested: false,
      nutritionEquation: undefined,
      estimatedBmrKcal: undefined,
      estimatedTdeeKcal: undefined,
      nutritionGoal: undefined,
      planningGoal: "balanced",
      calorieTargetKcal: undefined,
      proteinTargetG: undefined,
      fatTargetG: undefined,
      carbohydratesTargetG: undefined,
      fibreTargetG: undefined,
      updatedAt: now,
    }),
    ctx.db.patch(memberId, {
      age: undefined,
      sex: undefined,
      heightCm: undefined,
      weightKg: undefined,
      updatedAt: now,
    }),
  ]);
}

async function upsertMitraReadiness(
  ctx: MutationCtx,
  householdId: Id<"households">,
  memberId: Id<"members">,
  now: number,
) {
  const existing = await ctx.db
    .query("mitraMemberStates")
    .withIndex("by_member", (q) => q.eq("memberId", memberId))
    .unique();
  if (existing) {
    return ctx.db.patch(existing._id, {
      readiness: "ready",
      introducedAt: existing.introducedAt ?? now,
      updatedAt: now,
    });
  }
  return ctx.db.insert("mitraMemberStates", {
    householdId,
    memberId,
    readiness: "ready",
    introducedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

async function replacePreference(
  ctx: MutationCtx,
  args: {
    householdId: Id<"households">;
    category: string;
    key: string;
    value: string;
    now: number;
  },
) {
  const existing = await ctx.db
    .query("preferences")
    .withIndex("by_household", (q) => q.eq("householdId", args.householdId))
    .collect();
  await Promise.all(
    existing
      .filter((item) => item.active && item.category === args.category && item.key === args.key && !item.memberId)
      .map((item) => ctx.db.patch(item._id, { active: false, updatedAt: args.now })),
  );
  const value = args.value.trim();
  if (!value) return null;
  return ctx.db.insert("preferences", {
    householdId: args.householdId,
    category: args.category,
    key: args.key,
    value,
    source: "onboarding",
    active: true,
    createdAt: args.now,
    updatedAt: args.now,
  });
}

async function deactivateMember(
  ctx: MutationCtx,
  householdId: Id<"households">,
  memberId: Id<"members">,
  now: number,
) {
  const [routines, endpoints, profiles, cooks, preferences] = await Promise.all([
    ctx.db.query("routines").withIndex("by_household", (q) => q.eq("householdId", householdId)).collect(),
    ctx.db.query("communicationEndpoints").withIndex("by_member", (q) => q.eq("memberId", memberId)).collect(),
    ctx.db.query("tarlaMemberProfiles").withIndex("by_member", (q) => q.eq("memberId", memberId)).collect(),
    ctx.db.query("tarlaCookStates").withIndex("by_member", (q) => q.eq("memberId", memberId)).collect(),
    ctx.db.query("preferences").withIndex("by_member", (q) => q.eq("memberId", memberId)).collect(),
  ]);
  await Promise.all([
    ctx.db.patch(memberId, { active: false, updatedAt: now }),
    ...routines
      .filter((routine) => routine.memberId === memberId || routine.recipientMemberId === memberId)
      .map((routine) => disableRoutine(ctx, routine, now)),
    ...endpoints.map((endpoint) => ctx.db.patch(endpoint._id, { active: false, updatedAt: now })),
    ...profiles.map((profile) => ctx.db.patch(profile._id, { includedInPlanning: false, nutritionRequested: false, updatedAt: now })),
    ...cooks.map((cook) => ctx.db.patch(cook._id, { active: false, updatedAt: now })),
    ...preferences.map((preference) => ctx.db.patch(preference._id, { active: false, updatedAt: now })),
  ]);
}

async function disableRoutine(ctx: MutationCtx, routine: Doc<"routines">, now: number) {
  if (routine.scheduledJobId) {
    try {
      await ctx.scheduler.cancel(routine.scheduledJobId as Id<"_scheduled_functions">);
    } catch {
      // A completed scheduled job no longer needs cancellation.
    }
  }
  await ctx.db.patch(routine._id, {
    w2Enabled: false,
    scheduledJobId: undefined,
    nextOccurrenceAt: undefined,
    updatedAt: now,
  });
}

async function requireHousehold(
  ctx: MutationCtx,
  householdId: Id<"households">,
  ownerKey: string,
) {
  const household = await ctx.db.get(householdId);
  if (!household || household.ownerKey !== ownerKey) {
    throw new Error("Household not found");
  }
  return household;
}

function cleanMember(input: HouseholdMemberDraft) {
  return {
    name: requiredText(input.name, "Member name", 120),
    role: roleForMember(input),
    relationship: requiredText(input.relationship, "Relationship", 80),
    lifeStage: input.lifeStage,
    preferredSalutation: optionalText(input.preferredSalutation, 80),
    languagePreference: input.preferredLanguage,
    memberKind: input.memberKind,
    active: true,
  };
}

function validateSetup(setup: AeviaSetupPayload) {
  if (!setup || !Array.isArray(setup.members) || !setup.members.length) {
    throw new Error("Add at least one household member");
  }
  if (!new Set(["mitra", "tarla", "both"]).has(setup.agentChoice)) {
    throw new Error("Choose how Aevia should help");
  }
  const keys = setup.members.map((item) => item.clientKey);
  if (new Set(keys).size !== keys.length) throw new Error("Household members must be unique");
  if (setup.members.filter((item) => item.isPrimary).length !== 1) {
    throw new Error("Keep one primary household member");
  }
  if (setup.agentChoice !== "tarla" && !setup.mitraPeople.length) {
    throw new Error("Choose at least one person for Mitra");
  }
  for (const person of setup.mitraPeople) {
    if (!person.routines.length || person.routines.length > 4) {
      throw new Error("Add between one and four routines for each Mitra person");
    }
  }
  if (setup.agentChoice !== "mitra" && !setup.tarla.cookingPeople.length) {
    throw new Error("Add at least one person who prepares meals");
  }
}

function requiredMappedMember(map: Map<string, Id<"members">>, key: string) {
  const value = map.get(key);
  if (!value) throw new Error("A selected person is no longer in this household");
  return value;
}

function requiredText(value: string, label: string, maxLength: number) {
  const clean = value.trim();
  if (!clean) throw new Error(`${label} is required`);
  if (clean.length > maxLength) throw new Error(`${label} is too long`);
  return clean;
}

function optionalText(value: string | undefined, maxLength: number) {
  const clean = value?.trim();
  if (!clean) return undefined;
  if (clean.length > maxLength) throw new Error("This detail is too long");
  return clean;
}

function uniqueTextList(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function validPhone(value: string) {
  const clean = value.replace(/[\s()-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(clean)) {
    throw new Error("Enter a valid WhatsApp number with its country code");
  }
  return clean;
}

function supportedLanguage(value: string | undefined): "English" | "Hindi" | "Hinglish" {
  if (value === "Hindi" || value === "Hinglish") return value;
  return "English";
}

function legacyRelationship(value: string | undefined): "Mother" | "Father" | "Other" {
  const normalized = value?.toLocaleLowerCase();
  if (normalized === "mother") return "Mother";
  if (normalized === "father") return "Father";
  return "Other";
}

function legacyFrequency(timing: ReturnType<typeof buildRoutineTiming>) {
  if (timing.kind !== "recurring") return "Once" as const;
  if (timing.recurrence.frequency === "daily") return "Daily" as const;
  if (timing.recurrence.frequency === "monthly") return "Monthly" as const;
  return "Weekly" as const;
}

function classifyFoodRule(description: string) {
  const lower = description.toLocaleLowerCase();
  if (lower.includes("vegetarian")) {
    return { ruleType: "vegetarian_days" as const, ingredientKey: undefined };
  }
  const noIngredient = lower.match(/^(?:no|avoid)\s+([a-z][a-z\s/-]{1,50})$/i);
  if (noIngredient) {
    return {
      ruleType: "ingredient_excluded_days" as const,
      ingredientKey: noIngredient[1].trim().replace(/\s+/g, "_"),
    };
  }
  return { ruleType: "custom_days" as const, ingredientKey: undefined };
}

function endOfLocalDay(value: string | undefined) {
  if (!value) return undefined;
  const timestamp = new Date(`${value}T23:59:59.999Z`).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}
