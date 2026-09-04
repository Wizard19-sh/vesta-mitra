import { v } from "convex/values";
import { mutation } from "./_generated/server";

export const linkConsentedCookRecipient = mutation({
  args: {
    adminKey: v.string(),
    ownerKey: v.string(),
    householdId: v.id("households"),
    cookMemberId: v.id("members"),
    recipientE164: v.string(),
  },
  handler: async (ctx, args) => {
    requireBetaAdmin(args.adminKey);
    const household = await ctx.db.get(args.householdId);
    if (!household || household.ownerKey !== args.ownerKey) {
      throw new Error("Household was not found for this owner");
    }
    const cookMember = await ctx.db.get(args.cookMemberId);
    if (!cookMember || cookMember.householdId !== household._id || cookMember.active === false) {
      throw new Error("Cooking person was not found in this household");
    }
    const cookState = await ctx.db
      .query("tarlaCookStates")
      .withIndex("by_member", (q) => q.eq("memberId", cookMember._id))
      .unique();
    if (!cookState || cookState.active === false) {
      throw new Error("Active cooking-person setup was not found");
    }
    const endpoint = await ctx.db.get(cookState.communicationEndpointId);
    if (!endpoint || endpoint.householdId !== household._id || endpoint.memberId !== cookMember._id) {
      throw new Error("Cooking-person WhatsApp contact was not found");
    }
    if (!endpoint.active || endpoint.consentStatus !== "granted") {
      throw new Error("Cooking-person WhatsApp consent is not active");
    }
    const recipientE164 = validE164(args.recipientE164);
    const conflictingEndpoint = await ctx.db
      .query("communicationEndpoints")
      .withIndex("by_channel_and_address", (q) =>
        q.eq("channel", "whatsapp").eq("address", recipientE164),
      )
      .first();
    if (conflictingEndpoint && conflictingEndpoint._id !== endpoint._id) {
      throw new Error("That beta recipient is already linked to another contact");
    }
    const changed = endpoint.address !== recipientE164;
    await ctx.db.patch(endpoint._id, {
      ...(changed ? { address: recipientE164 } : {}),
      providerMetadata: {
        ...endpoint.providerMetadata,
        provider: "meta",
        ready: true,
      },
      updatedAt: Date.now(),
    });
    const now = Date.now();
    await ctx.db.insert("productAnalyticsEvents", {
      eventKey: `beta-cook-link:${endpoint._id}:${now}`,
      anonymousId: "owner-test-admin",
      householdId: household._id,
      eventName: "beta_cook_recipient_linked",
      route: "/admin/beta",
      agent: "tarla",
      outcome: changed ? "existing_contact_updated" : "existing_contact_confirmed",
      occurredAt: now,
      createdAt: now,
    });
    return {
      householdId: household._id,
      cookMemberId: cookMember._id,
      cookStateId: cookState._id,
      endpointId: endpoint._id,
      changed,
      provider: "meta",
      ready: true,
    };
  },
});

function requireBetaAdmin(value: string) {
  const expected = process.env.BETA_ADMIN_KEY?.trim();
  if (!expected || value.trim() !== expected) {
    throw new Error("Beta admin access is not configured or authorised");
  }
}

function validE164(value: string) {
  const result = value.trim();
  if (!/^\+[1-9]\d{7,14}$/.test(result)) throw new Error("Beta recipient number is invalid");
  return result;
}
