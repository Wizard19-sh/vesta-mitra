"use node";

import { v } from "convex/values";
import {
  normalizeMetaGraphApiVersion,
  normalizeMetaPhoneNumberId,
} from "../lib/metaWhatsAppTransport";
import { action } from "./_generated/server";

export const checkAuthentication = action({
  args: { adminKey: v.string() },
  handler: async (_ctx, args) => {
    requireBetaAdmin(args.adminKey);
    const accessToken = requiredEnvironment("META_WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = normalizeMetaPhoneNumberId(
      requiredEnvironment("META_WHATSAPP_PHONE_NUMBER_ID"),
    );
    const apiVersion = normalizeMetaGraphApiVersion(
      requiredEnvironment("META_GRAPH_API_VERSION"),
    );
    const response = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}?fields=id`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );
    const result = await safeJson(response);
    return {
      authenticated: response.ok && result?.id === phoneNumberId,
      httpStatus: response.status,
      apiVersion,
    };
  },
});

function requireBetaAdmin(value: string) {
  const expected = process.env.BETA_ADMIN_KEY?.trim();
  if (!expected || value.trim() !== expected) {
    throw new Error("Beta admin access is not configured or authorised");
  }
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function safeJson(response: Response) {
  try {
    const value: unknown = await response.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}
