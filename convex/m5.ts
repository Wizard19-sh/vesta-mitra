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
        ctx.db.patch(member._id, { name, updatedAt: now }),
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
    const routine = routines.find(
      (item) => item.w2Enabled && item.memberId && item.communicationEndpointId,
    );
    const parent = routine
      ? parents.find((item) => item._id === routine.parentId)
      : undefined;
    const mitraMember = routine
      ? members.find((item) => item._id === routine.memberId)
      : undefined;
    const mitraEndpoint = routine
      ? endpoints.find((item) => item._id === routine.communicationEndpointId)
      : undefined;
    const mitraState = routine
      ? mitraStates.find((item) => item.memberId === routine.memberId)
      : undefined;

    const cookState = [...tarlaCookStates].sort(
      (left, right) => right.updatedAt - left.updatedAt,
    )[0];
    const cookMember = cookState
      ? members.find((item) => item._id === cookState.memberId)
      : undefined;
    const cookEndpoint = cookState
      ? endpoints.find((item) => item._id === cookState.communicationEndpointId)
      : undefined;
    const activeCookVisits = cookState
      ? tarlaCookVisits.filter(
          (visit) => visit.cookStateId === cookState._id && visit.active,
        )
      : [];
    const tarlaPrimaryProfile = tarlaMemberProfiles.find(
      (item) => item.memberId === member._id,
    );
    const adultMember = members.find(
      (item) =>
        item._id !== member._id &&
        item._id !== cookState?.memberId &&
        item.role === "adult" &&
        tarlaMemberProfiles.some((profileItem) => profileItem.memberId === item._id),
    );
    const childMember = members.find(
      (item) =>
        item.role === "child" &&
        tarlaMemberProfiles.some((profileItem) => profileItem.memberId === item._id),
    );
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
    const hasMitra = Boolean(routine && parent && mitraMember && mitraEndpoint);
    const hasTarla = Boolean(tarlaHouseholdProfile || tarlaPrimaryProfile || cookState);

    return {
      profile,
      household,
      member,
      setup: {
        agentChoice: hasMitra && hasTarla ? "both" : hasTarla ? "tarla" : "mitra",
        sharedContext: sharedContext?.value ?? "",
        mitra:
          hasMitra && routine && parent && mitraMember && mitraEndpoint
            ? {
                member: mitraMember,
                parent,
                endpoint: mitraEndpoint,
                readiness: mitraState?.readiness ?? "not_introduced",
                routine,
              }
            : null,
        tarla: hasTarla
          ? {
              householdProfile: tarlaHouseholdProfile,
              primaryProfile: tarlaPrimaryProfile,
              adultMember: adultMember ?? null,
              childMember: childMember ?? null,
              cookState: cookState ?? null,
              cookMember: cookMember ?? null,
              cookEndpoint: cookEndpoint ?? null,
              cookVisits: activeCookVisits,
              dietaryRules: tarlaRules.filter((item) => item.active),
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
    const [primaryMember, members, preferences, endpoints, routines, dayPlans, runs, cookVisits] =
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
          .query("tarlaCookVisits")
          .withIndex("by_household", (q) => q.eq("householdId", household._id))
          .collect(),
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
      members,
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
      latestInstances,
      dayPlans,
      runs,
      cookVisits: cookVisits.filter((visit) => visit.active),
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
