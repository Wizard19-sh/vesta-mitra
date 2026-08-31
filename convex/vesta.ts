import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

const preferenceSource = v.union(
  v.literal("onboarding"),
  v.literal("explicit_correction"),
  v.literal("agent_observation"),
);

const preferredMode = v.union(
  v.literal("text"),
  v.literal("voice"),
  v.literal("both"),
);

const consentStatus = v.union(
  v.literal("unknown"),
  v.literal("pending"),
  v.literal("granted"),
  v.literal("revoked"),
);

export const createHousehold = mutation({
  args: {
    ownerKey: v.string(),
    name: v.string(),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("households", {
      ownerKey: requiredText(args.ownerKey, "Owner key", 200),
      name: requiredText(args.name, "Household name", 120),
      timezone: requiredText(args.timezone, "Timezone", 100),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateHousehold = mutation({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
    name: v.optional(v.string()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, { ownerKey, householdId, name, timezone }) => {
    await ownedHousehold(ctx, householdId, ownerKey);
    if (name === undefined && timezone === undefined) return householdId;

    await ctx.db.patch(householdId, {
      ...(name === undefined ? {} : { name: requiredText(name, "Household name", 120) }),
      ...(timezone === undefined
        ? {}
        : { timezone: requiredText(timezone, "Timezone", 100) }),
      updatedAt: Date.now(),
    });
    return householdId;
  },
});

export const listHouseholds = query({
  args: { ownerKey: v.string() },
  handler: async (ctx, { ownerKey }) =>
    ctx.db
      .query("households")
      .withIndex("by_owner", (q) => q.eq("ownerKey", ownerKey))
      .order("desc")
      .collect(),
});

export const addMember = mutation({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
    name: v.string(),
    role: v.string(),
    age: v.optional(v.number()),
    sex: v.optional(v.string()),
    heightCm: v.optional(v.number()),
    weightKg: v.optional(v.number()),
    languagePreference: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ownedHousehold(ctx, args.householdId, args.ownerKey);
    optionalPositiveNumber(args.age, "Age");
    optionalPositiveNumber(args.heightCm, "Height");
    optionalPositiveNumber(args.weightKg, "Weight");

    const now = Date.now();
    return ctx.db.insert("members", {
      householdId: args.householdId,
      name: requiredText(args.name, "Member name", 120),
      role: requiredText(args.role, "Member role", 80),
      age: args.age,
      sex: optionalText(args.sex, "Sex", 80),
      heightCm: args.heightCm,
      weightKg: args.weightKg,
      languagePreference: optionalText(
        args.languagePreference,
        "Language preference",
        80,
      ),
      notes: optionalText(args.notes, "Member notes", 2_000),
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listMembers = query({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
  },
  handler: async (ctx, { ownerKey, householdId }) => {
    await ownedHousehold(ctx, householdId, ownerKey);
    return ctx.db
      .query("members")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .collect();
  },
});

export const rememberPreference = mutation({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
    memberId: v.optional(v.id("members")),
    category: v.string(),
    key: v.string(),
    value: v.string(),
    source: preferenceSource,
  },
  handler: async (ctx, args) => {
    await ownedHousehold(ctx, args.householdId, args.ownerKey);
    if (args.memberId) {
      await householdMember(ctx, args.memberId, args.householdId);
    }

    const category = requiredText(args.category, "Preference category", 80);
    const key = requiredText(args.key, "Preference key", 120);
    const now = Date.now();
    const existing = await ctx.db
      .query("preferences")
      .withIndex("by_household", (q) =>
        q.eq("householdId", args.householdId),
      )
      .collect();

    const superseded = existing.filter(
      (preference) =>
        preference.active &&
        preference.memberId === args.memberId &&
        preference.category === category &&
        preference.key === key,
    );
    await Promise.all(
      superseded.map((preference) =>
        ctx.db.patch(preference._id, { active: false, updatedAt: now }),
      ),
    );

    return ctx.db.insert("preferences", {
      householdId: args.householdId,
      memberId: args.memberId,
      category,
      key,
      value: requiredText(args.value, "Preference value", 2_000),
      source: args.source,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setPreferenceActive = mutation({
  args: {
    ownerKey: v.string(),
    preferenceId: v.id("preferences"),
    active: v.boolean(),
  },
  handler: async (ctx, { ownerKey, preferenceId, active }) => {
    const preference = await ctx.db.get(preferenceId);
    if (!preference) throw new Error("Preference not found");
    await ownedHousehold(ctx, preference.householdId, ownerKey);
    await ctx.db.patch(preferenceId, { active, updatedAt: Date.now() });
    return preferenceId;
  },
});

export const listPreferences = query({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, { ownerKey, householdId, includeInactive }) => {
    await ownedHousehold(ctx, householdId, ownerKey);
    const preferences = await ctx.db
      .query("preferences")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .collect();
    return includeInactive
      ? preferences
      : preferences.filter((preference) => preference.active);
  },
});

export const addCommunicationEndpoint = mutation({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
    memberId: v.id("members"),
    channel: v.string(),
    address: v.string(),
    preferredLanguage: v.optional(v.string()),
    preferredMode,
    providerMetadata: v.optional(
      v.object({
        provider: v.optional(v.string()),
        externalId: v.optional(v.string()),
      }),
    ),
    active: v.optional(v.boolean()),
    consentStatus: v.optional(consentStatus),
    verifiedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ownedHousehold(ctx, args.householdId, args.ownerKey);
    await householdMember(ctx, args.memberId, args.householdId);
    const now = Date.now();

    return ctx.db.insert("communicationEndpoints", {
      householdId: args.householdId,
      memberId: args.memberId,
      channel: requiredText(args.channel, "Channel", 80),
      address: requiredText(args.address, "Endpoint address", 500),
      preferredLanguage: optionalText(
        args.preferredLanguage,
        "Preferred language",
        80,
      ),
      preferredMode: args.preferredMode,
      providerMetadata: args.providerMetadata
        ? {
            provider: optionalText(
              args.providerMetadata.provider,
              "Provider name",
              100,
            ),
            externalId: optionalText(
              args.providerMetadata.externalId,
              "Provider external ID",
              300,
            ),
          }
        : undefined,
      active: args.active ?? true,
      consentStatus: args.consentStatus ?? "unknown",
      verifiedAt: args.verifiedAt,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateCommunicationEndpointStatus = mutation({
  args: {
    ownerKey: v.string(),
    endpointId: v.id("communicationEndpoints"),
    active: v.optional(v.boolean()),
    consentStatus: v.optional(consentStatus),
    verifiedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const endpoint = await ctx.db.get(args.endpointId);
    if (!endpoint) throw new Error("Communication endpoint not found");
    await ownedHousehold(ctx, endpoint.householdId, args.ownerKey);

    await ctx.db.patch(args.endpointId, {
      ...(args.active === undefined ? {} : { active: args.active }),
      ...(args.consentStatus === undefined
        ? {}
        : { consentStatus: args.consentStatus }),
      ...(args.verifiedAt === undefined
        ? {}
        : { verifiedAt: args.verifiedAt }),
      updatedAt: Date.now(),
    });
    return args.endpointId;
  },
});

export const listCommunicationEndpoints = query({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, { ownerKey, householdId, includeInactive }) => {
    await ownedHousehold(ctx, householdId, ownerKey);
    const endpoints = await ctx.db
      .query("communicationEndpoints")
      .withIndex("by_household", (q) => q.eq("householdId", householdId))
      .collect();
    return includeInactive
      ? endpoints
      : endpoints.filter((endpoint) => endpoint.active);
  },
});

export const getHouseholdContext = query({
  args: {
    ownerKey: v.string(),
    householdId: v.id("households"),
  },
  handler: async (ctx, { ownerKey, householdId }) => {
    const household = await ownedHousehold(ctx, householdId, ownerKey);
    const [members, preferences] = await Promise.all([
      ctx.db
        .query("members")
        .withIndex("by_household", (q) => q.eq("householdId", householdId))
        .collect(),
      ctx.db
        .query("preferences")
        .withIndex("by_household", (q) => q.eq("householdId", householdId))
        .collect(),
    ]);

    return {
      household,
      members,
      preferences: preferences.filter((preference) => preference.active),
    };
  },
});

export const linkLegacyParent = mutation({
  args: {
    ownerKey: v.string(),
    parentId: v.id("parents"),
    householdId: v.id("households"),
    memberId: v.id("members"),
  },
  handler: async (ctx, { ownerKey, parentId, householdId, memberId }) => {
    await ownedHousehold(ctx, householdId, ownerKey);
    await householdMember(ctx, memberId, householdId);
    const parent = await ctx.db.get(parentId);
    if (!parent || parent.ownerKey !== ownerKey) {
      throw new Error("Parent not found");
    }
    await ctx.db.patch(parentId, { householdId, memberId });
    return parentId;
  },
});

async function ownedHousehold(
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

async function householdMember(
  ctx: QueryCtx | MutationCtx,
  memberId: Id<"members">,
  householdId: Id<"households">,
) {
  const member = await ctx.db.get(memberId);
  if (!member || member.householdId !== householdId) {
    throw new Error("Member not found in household");
  }
  return member;
}

function requiredText(value: string, label: string, maxLength: number) {
  const clean = value.trim();
  if (!clean) throw new Error(`${label} is required`);
  if (clean.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer`);
  }
  return clean;
}

function optionalText(
  value: string | undefined,
  label: string,
  maxLength: number,
) {
  if (value === undefined) return undefined;
  const clean = value.trim();
  if (!clean) return undefined;
  if (clean.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer`);
  }
  return clean;
}

function optionalPositiveNumber(value: number | undefined, label: string) {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
    throw new Error(`${label} must be a positive number`);
  }
}
