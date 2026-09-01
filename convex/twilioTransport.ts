"use node";

import { v } from "convex/values";
import twilio from "twilio";
import { formatTwilioWhatsAppAddress } from "../lib/twilioTransport";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

type DispatchResult =
  | {
      transportMessageId: Id<"transportMessages">;
      providerMessageId: string;
      providerStatus: string;
      acceptedAt: number;
    }
  | {
      transportMessageId: Id<"transportMessages">;
      failed: true;
      failureCode: string;
    }
  | null;

export const dispatchOutbound = internalAction({
  args: { transportMessageId: v.id("transportMessages") },
  handler: async (ctx, args): Promise<DispatchResult> => {
    const context = await ctx.runQuery(
      internal.transportMessages.getDispatchContext,
      args,
    );
    if (!context || context.message.status !== "requested") return null;
    const { message, endpoint } = context;
    try {
      if (
        message.provider !== "twilio" ||
        endpoint.providerMetadata?.provider?.toLocaleLowerCase() !== "twilio"
      ) {
        throw new SafeTransportError(
          "provider_configuration",
          "Outbound provider configuration does not match Twilio",
        );
      }
      if (
        !endpoint.active ||
        endpoint.consentStatus !== "granted" ||
        endpoint.providerMetadata?.ready !== true
      ) {
        throw new SafeTransportError(
          "recipient_not_ready",
          "Recipient endpoint is not ready for real messaging",
        );
      }
      const accountSid = requiredEnvironment("TWILIO_ACCOUNT_SID");
      const authToken = requiredEnvironment("TWILIO_AUTH_TOKEN");
      const from = formatTwilioWhatsAppAddress(
        requiredEnvironment("TWILIO_WHATSAPP_FROM"),
      );
      const to = formatTwilioWhatsAppAddress(endpoint.address);
      const statusCallback = optionalHttpsEnvironment(
        "TWILIO_STATUS_CALLBACK_URL",
      );
      const client = twilio(accountSid, authToken);
      const result = await client.messages.create({
        body: message.message,
        from,
        to,
        ...(statusCallback ? { statusCallback } : {}),
      });
      if (!result.sid) {
        throw new SafeTransportError(
          "missing_provider_id",
          "Twilio accepted no provider message identifier",
        );
      }
      const acceptedAt = Date.now();
      await ctx.runMutation(
        internal.transportMessages.markProviderAccepted,
        {
          transportMessageId: message._id,
          providerMessageId: result.sid,
          providerStatus: result.status || "queued",
          acceptedAt,
        },
      );
      return {
        transportMessageId: message._id,
        providerMessageId: result.sid,
        providerStatus: result.status || "queued",
        acceptedAt,
      };
    } catch (error) {
      const failure = safeFailure(error);
      await ctx.runMutation(internal.transportMessages.markProviderFailed, {
        transportMessageId: message._id,
        failureCode: failure.code,
        failureSummary: failure.summary,
        failedAt: Date.now(),
      });
      return {
        transportMessageId: message._id,
        failed: true,
        failureCode: failure.code,
      };
    }
  },
});

export const validateWebhook = internalAction({
  args: {
    kind: v.union(v.literal("inbound"), v.literal("status")),
    requestUrl: v.string(),
    signature: v.string(),
    params: v.array(v.object({ key: v.string(), value: v.string() })),
  },
  handler: async (_ctx, args) => {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const configuredUrl =
      args.kind === "inbound"
        ? process.env.TWILIO_INBOUND_WEBHOOK_URL
        : process.env.TWILIO_STATUS_CALLBACK_URL;
    if (!authToken || !accountSid || !configuredUrl) {
      return {
        configured: false,
        valid: false,
        reason: "missing_configuration" as const,
      };
    }
    if (args.requestUrl !== configuredUrl) {
      return {
        configured: true,
        valid: false,
        reason: "url_mismatch" as const,
      };
    }
    const params: Record<string, string | string[]> = {};
    for (const { key, value } of args.params) {
      const existing = params[key];
      params[key] =
        existing === undefined
          ? value
          : Array.isArray(existing)
            ? [...existing, value]
            : [existing, value];
    }
    if (params.AccountSid !== accountSid) {
      return {
        configured: true,
        valid: false,
        reason: "account_mismatch" as const,
      };
    }
    const valid = twilio.validateRequest(
      authToken,
      args.signature,
      configuredUrl,
      params,
    );
    return {
      configured: true,
      valid,
      reason: valid ? ("valid" as const) : ("invalid_signature" as const),
    };
  },
});

class SafeTransportError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new SafeTransportError(
      "missing_configuration",
      "Twilio development transport is not configured",
    );
  }
  return value;
}

function optionalHttpsEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  if (!value.startsWith("https://")) {
    throw new SafeTransportError(
      "invalid_callback_url",
      "Twilio callback URL must use HTTPS",
    );
  }
  return value;
}

function safeFailure(error: unknown) {
  if (error instanceof SafeTransportError) {
    return { code: error.code, summary: error.message };
  }
  const candidate = error as {
    code?: number | string;
    status?: number;
  };
  const code =
    candidate?.code === undefined
      ? candidate?.status === undefined
        ? "provider_error"
        : `http_${candidate.status}`
      : String(candidate.code).slice(0, 80);
  return {
    code,
    summary: "Twilio rejected or failed the WhatsApp message request",
  };
}
