import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

export const getRuntimeVersion = query({
  args: {},
  handler: async () => "m5-functional-cleanup-v1" as const,
});

export const createOrUpdateIdentity = mutation({
  args: {
    ownerKey: v.string(),
    name: v.string(),
    email: v.string(),
    householdName: v.string(),
    timezone: v.string(),
    termsVersion: v.string(),
    privacyVersion: v.string(),
    accepted: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (!args.accepted) {
      throw new Error("Beta Terms and Privacy acceptance is required");
    }
    const ownerKey = requiredText(args.ownerKey, "Device credential", 200);
    if (ownerKey.length < 32) {
      throw new Error("Device credential is invalid");
    }
    const name = requiredText(args.name, "Name", 120);
    const email = validEmail(args.email);
    const householdName = requiredText(
      args.householdName || `${name}'s household`,
      "Household name",
      120,
    );
    const timezone = validTimezone(args.timezone);
    const termsVersion = requiredText(args.termsVersion, "Terms version", 40);
    const privacyVersion = requiredText(
      args.privacyVersion,
      "Privacy version",
      40,
    );
    const now = Date.now();
    const existing = await ctx.db
      .query("betaUserProfiles")
      .withIndex("by_owner", (q) => q.eq("ownerKey", ownerKey))
      .unique();

    if (existing) {
      const household = await requireHousehold(
        ctx,
        existing.householdId,
        ownerKey,
      );
      const member = await ctx.db.get(existing.memberId);
      if (!member || member.householdId !== household._id) {
        throw new Error("Primary household member was not found");
      }
      await Promise.all([
        ctx.db.patch(household._id, {
          name: householdName,
          timezone,
          updatedAt: now,
        }),
        ctx.db.patch(member._id, {
          name,
          relationship: member.relationship ?? "Self",
          lifeStage: member.lifeStage ?? "adult",
          preferredSalutation: member.preferredSalutation ?? name,
          memberKind: member.memberKind ?? "household",
          active: true,
          updatedAt: now,
        }),
        ctx.db.patch(existing._id, {
          name,
          email,
          termsVersion,
          privacyVersion,
          acceptedAt: now,
          betaStatus: "accepted",
          updatedAt: now,
        }),
      ]);
      return {
        profileId: existing._id,
        householdId: household._id,
        memberId: member._id,
        acceptedAt: now,
      };
    }

    const householdId = await ctx.db.insert("households", {
      ownerKey,
      name: householdName,
      timezone,
      createdAt: now,
      updatedAt: now,
    });
    const memberId = await ctx.db.insert("members", {
      householdId,
      name,
      role: "primary user",
      relationship: "Self",
      lifeStage: "adult",
      preferredSalutation: name,
      memberKind: "household",
      active: true,
      languagePreference: "English",
      createdAt: now,
      updatedAt: now,
    });
    const profileId = await ctx.db.insert("betaUserProfiles", {
      ownerKey,
      householdId,
      memberId,
      name,
      email,
      termsVersion,
      privacyVersion,
      acceptedAt: now,
      betaStatus: "accepted",
      createdAt: now,
      updatedAt: now,
    });
    return { profileId, householdId, memberId, acceptedAt: now };
  },
});

export const getSession = query({
  args: { ownerKey: v.string() },
  handler: async (ctx, { ownerKey }) => {
    const profile = await ctx.db
      .query("betaUserProfiles")
      .withIndex("by_owner", (q) => q.eq("ownerKey", ownerKey))
      .unique();
    if (!profile) return null;
    const household = await requireHousehold(ctx, profile.householdId, ownerKey);
    const member = await ctx.db.get(profile.memberId);
    if (!member || member.householdId !== household._id) return null;
    const [
      members,
      parents,
      routines,
      endpoints,
      preferences,
      mitraStates,
      tarlaHouseholdProfile,
      tarlaMemberProfiles,
      tarlaRules,
      tarlaCookStates,
      tarlaCookVisits,
      tarlaDayPlans,
    ] = await Promise.all([
      ctx.db
        .query("members")
        .withIndex("by_household", (q) => q.eq("householdId", household._id))
        .collect(),
      ctx.db
        .query("parents")
        .withIndex("by_household", (q) => q.eq("householdId", household._id))
        .collect(),
      ctx.db
        .query("routines")
        .withIndex("by_household", (q) => q.eq("householdId", household._id))
        .order("desc")
        .collect(),
      ctx.db
        .query("communicationEndpoints")
        .withIndex("by_household", (q) => q.eq("householdId", household._id))
        .collect(),
      ctx.db
        .query("preferences")
        .withIndex("by_household", (q) => q.eq("householdId", household._id))
        .collect(),
      ctx.db
        .query("mitraMemberStates")
        .withIndex("by_household", (q) => q.eq("householdId", household._id))
        .collect(),
      ctx.db
        .query("tarlaHouseholdProfiles")
        .withIndex("by_household", (q) => q.eq("householdId", household._id))
        .unique(),
      ctx.db
        .query("tarlaMemberProfiles")
        .withIndex("by_household", (q) => q.eq("householdId", household._id))
        .collect(),
      ctx.db
        .query("tarlaDietaryRules")
        .withIndex("by_household", (q) => q.eq("householdId", household._id))
        .collect(),
      ctx.db
        .query("tarlaCookStates")
        .withIndex("by_household", (q) => q.eq("householdId", household._id))
        .collect(),
      ctx.db
        .query("tarlaCookVisits")
        .withIndex("by_household", (q) => q.eq("householdId", household._id))
        .collect(),
      ctx.db
        .query("tarlaDayPlans")
        .withIndex("by_household", (q) => q.eq("householdId", household._id))
        .order("desc")
        .collect(),
    ]);

    const now = Date.now();
    const activePreferences = preferences.filter(
      (item) =>
        item.active &&
        (item.expiresAt === undefined || item.expiresAt > now),
    );
    const activeMembers = members.filter((item) => item.active !== false);
    const activeMemberIds = new Set(activeMembers.map((item) => String(item._id)));
    const mitraPeople = parents
      .filter((parent) => parent.memberId && activeMemberIds.has(String(parent.memberId)))
      .map((parent) => {
        const targetMember = activeMembers.find((item) => item._id === parent.memberId)!;
        const caretakerMember = parent.caretakerMemberId
          ? activeMembers.find((item) => item._id === parent.caretakerMemberId) ?? null
          : null;
        return {
          member: targetMember,
          parent,
          caretakerMember,
          directEndpoint:
            endpoints.find(
              (endpoint) => endpoint.memberId === targetMember._id && endpoint.channel === "whatsapp" && endpoint.active,
            ) ?? null,
          caretakerEndpoint: caretakerMember
            ? endpoints.find(
                (endpoint) => endpoint.memberId === caretakerMember._id && endpoint.channel === "whatsapp" && endpoint.active,
              ) ?? null
            : null,
          readiness:
            mitraStates.find((item) => item.memberId === targetMember._id)?.readiness ??
            "not_introduced",
          routines: routines.filter(
            (routine) => routine.memberId === targetMember._id && routine.w2Enabled,
          ),
        };
      })
      .filter((item) => item.routines.length > 0);

    const activeCookStates = tarlaCookStates.filter((item) => item.active !== false);
    const cookingPeople = activeCookStates.map((cookState) => ({
      cookState,
      member: activeMembers.find((item) => item._id === cookState.memberId) ?? null,
      endpoint:
        endpoints.find((item) => item._id === cookState.communicationEndpointId) ?? null,
      visits: tarlaCookVisits.filter(
        (visit) => visit.cookStateId === cookState._id && visit.active,
      ),
    }));
    const cookState = activeCookStates[0];
    const cookMember = cookingPeople[0]?.member ?? undefined;
    const cookEndpoint = cookingPeople[0]?.endpoint ?? undefined;
    const activeCookVisits = cookingPeople[0]?.visits ?? [];
    const tarlaPrimaryProfile = tarlaMemberProfiles.find(
      (item) => item.memberId === member._id && item.includedInPlanning !== false,
    );
    const eaterProfiles = tarlaMemberProfiles
      .filter(
        (item) => item.includedInPlanning !== false && activeMemberIds.has(String(item.memberId)),
      )
      .map((profileItem) => ({
        member: activeMembers.find((item) => item._id === profileItem.memberId)!,
        profile: profileItem,
      }));
    const sharedContext = activePreferences.find(
      (item) =>
        item.category === "household_context" &&
        item.key === "user_provided_context",
    );
    const cuisinePreference = activePreferences.find(
      (item) => item.category === "tarla_onboarding" && item.key === "cuisines",
    );
    const foodPreference = activePreferences.find(
      (item) => item.category === "tarla_onboarding" && item.key === "food_context",
    );
    const agentChoicePreference = activePreferences.find(
      (item) => item.category === "household_setup" && item.key === "specialists",
    );
    const hasMitra = mitraPeople.length > 0;
    const hasTarla = Boolean(tarlaHouseholdProfile || eaterProfiles.length || activeCookStates.length);
    const inferredChoice = hasMitra && hasTarla ? "both" : hasTarla ? "tarla" : "mitra";
    const agentChoice =
      agentChoicePreference?.value === "both" ||
      agentChoicePreference?.value === "tarla" ||
      agentChoicePreference?.value === "mitra"
        ? agentChoicePreference.value
        : inferredChoice;

    return {
      profile,
      household,
      member,
      setup: {
        members: activeMembers,
        hasSpecialistSetup: hasMitra || hasTarla,
        agentChoice,
        sharedContext: sharedContext?.value ?? "",
        mitraPeople,
        mitra: mitraPeople[0]
          ? {
              ...mitraPeople[0],
              endpoint:
                mitraPeople[0].parent.coordinationMode === "caretaker"
                  ? mitraPeople[0].caretakerEndpoint
                  : mitraPeople[0].directEndpoint,
              routine: mitraPeople[0].routines[0],
            }
          : null,
        tarla: hasTarla
          ? {
              householdProfile: tarlaHouseholdProfile,
              primaryProfile: tarlaPrimaryProfile,
              eaterProfiles,
              cookingPeople,
              cookState: cookState ?? null,
              cookMember: cookMember ?? null,
              cookEndpoint: cookEndpoint ?? null,
              cookVisits: activeCookVisits,
              dietaryRules: tarlaRules.filter(
                (item) => item.active && (item.expiresAt === undefined || item.expiresAt > now),
              ),
              cuisines: cuisinePreference?.value ?? "",
              foodContext: foodPreference?.value ?? "",
              latestDayPlan: tarlaDayPlans[0] ?? null,
            }
          : null,
      },
    };
  },
});

export const getDashboard = query({
  args: { ownerKey: v.string() },
  handler: async (ctx, { ownerKey }) => {
    const profile = await ctx.db
      .query("betaUserProfiles")
      .withIndex("by_owner", (q) => q.eq("ownerKey", ownerKey))
      .unique();
    if (!profile) return null;
    const household = await requireHousehold(ctx, profile.householdId, ownerKey);
    const [primaryMember, members, preferences, endpoints, parents, routines, dayPlans, runs, tarlaProfiles, tarlaRules, cookStates, cookVisits, executions, exceptions, shoppingNeeded, executionEvents] =
      await Promise.all([
        ctx.db.get(profile.memberId),
        ctx.db
          .query("members")
          .withIndex("by_household", (q) => q.eq("householdId", household._id))
          .collect(),
        ctx.db
          .query("preferences")
          .withIndex("by_household", (q) => q.eq("householdId", household._id))
          .collect(),
        ctx.db
          .query("communicationEndpoints")
          .withIndex("by_household", (q) => q.eq("householdId", household._id))
          .collect(),
        ctx.db
          .query("parents")
          .withIndex("by_household", (q) => q.eq("householdId", household._id))
          .collect(),
        ctx.db
          .query("routines")
          .withIndex("by_household", (q) => q.eq("householdId", household._id))
          .order("desc")
          .collect(),
        ctx.db
          .query("tarlaDayPlans")
          .withIndex("by_household", (q) => q.eq("householdId", household._id))
          .order("desc")
          .collect(),
        ctx.db
          .query("agentRuns")
          .withIndex("by_household", (q) => q.eq("householdId", household._id))
          .order("desc")
          .take(12),
        ctx.db
          .query("tarlaMemberProfiles")
          .withIndex("by_household", (q) => q.eq("householdId", household._id))
          .collect(),
        ctx.db
          .query("tarlaDietaryRules")
          .withIndex("by_household", (q) => q.eq("householdId", household._id))
          .collect(),
        ctx.db
          .query("tarlaCookStates")
          .withIndex("by_household", (q) => q.eq("householdId", household._id))
          .collect(),
        ctx.db
          .query("tarlaCookVisits")
          .withIndex("by_household", (q) => q.eq("householdId", household._id))
          .collect(),
        ctx.db
          .query("tarlaExecutions")
          .withIndex("by_household", (q) => q.eq("householdId", household._id))
          .order("desc")
          .take(24),
        ctx.db
          .query("executionExceptions")
          .withIndex("by_household", (q) => q.eq("householdId", household._id))
          .order("desc")
          .take(24),
        ctx.db
          .query("shoppingNeededItems")
          .withIndex("by_household", (q) => q.eq("householdId", household._id))
          .order("desc")
          .take(24),
        ctx.db
          .query("productAnalyticsEvents")
          .withIndex("by_household_and_time", (q) =>
            q.eq("householdId", household._id),
          )
          .order("desc")
          .take(250),
      ]);
    const latestInstances = await Promise.all(
      routines.map(async (routine) => {
        const instance = await ctx.db
          .query("checkIns")
          .withIndex("by_routine", (q) => q.eq("routineId", routine._id))
          .order("desc")
          .first();
        return { routineId: routine._id, instance };
      }),
    );
    const now = Date.now();
    return {
      profile: {
        name: profile.name,
        termsVersion: profile.termsVersion,
        privacyVersion: profile.privacyVersion,
        acceptedAt: profile.acceptedAt,
      },
      household,
      primaryMember,
      members: members.filter((item) => item.active !== false),
      preferences: preferences.filter(
        (item) =>
          item.active &&
          (item.expiresAt === undefined || item.expiresAt > now),
      ),
      endpointSummary: endpoints
        .filter((endpoint) => endpoint.active)
        .map((endpoint) => ({
          memberId: endpoint.memberId,
          channel: endpoint.channel,
          preferredLanguage: endpoint.preferredLanguage,
          preferredMode: endpoint.preferredMode,
          consentStatus: endpoint.consentStatus,
          ready: endpoint.providerMetadata?.ready ?? false,
          provider: endpoint.providerMetadata?.provider ?? "development",
        })),
      routines,
      parents,
      tarlaProfiles: tarlaProfiles.filter((item) => item.includedInPlanning !== false),
      tarlaRules: tarlaRules.filter(
        (item) => item.active && (item.expiresAt === undefined || item.expiresAt > now),
      ),
      cookStates: cookStates.filter((item) => item.active !== false),
      latestInstances,
      dayPlans,
      runs,
      cookVisits: cookVisits.filter((visit) => visit.active),
      executions,
      exceptions,
      shoppingNeeded: shoppingNeeded.filter((item) => item.status === "needed"),
      executionMetrics: {
        successfullyCompletedTasks: executionEvents.filter(
          (event) => event.eventName === "task_completed",
        ).length,
        primaryUserInterventions: executionEvents.filter(
          (event) => event.eventName === "primary_user_intervention",
        ).length,
      },
    };
  },
});

async function requireHousehold(
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

function requiredText(value: string, label: string, maxLength: number) {
  const clean = value.trim();
  if (!clean) throw new Error(`${label} is required`);
  if (clean.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer`);
  }
  return clean;
}

function validEmail(value: string) {
  const email = requiredText(value, "Email", 254).toLocaleLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address");
  }
  return email;
}

function validTimezone(value: string) {
  const timezone = requiredText(value, "Timezone", 100);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(0);
  } catch {
    throw new Error("Timezone must be a valid IANA timezone");
  }
  return timezone;
}
