"use node";

import { v } from "convex/values";
import {
  buildMetaMessagesUrl,
  buildMetaTextMessageBody,
} from "../lib/metaWhatsAppTransport";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
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
        message.provider !== "meta" ||
        endpoint.providerMetadata?.provider?.toLocaleLowerCase() !== "meta"
      ) {
        throw new SafeMetaTransportError(
          "provider_configuration",
          "Outbound provider configuration does not match Meta Cloud API",
        );
      }
      if (
        !endpoint.active ||
        endpoint.consentStatus !== "granted" ||
        endpoint.providerMetadata?.ready !== true
      ) {
        throw new SafeMetaTransportError(
          "recipient_not_ready",
          "Recipient endpoint is not ready for real messaging",
        );
      }
      if (message.channel.toLocaleLowerCase() !== "whatsapp") {
        throw new SafeMetaTransportError(
          "unsupported_channel",
          "Meta W4 transport supports only WhatsApp",
        );
      }
      const accessToken = requiredEnvironment("META_WHATSAPP_ACCESS_TOKEN");
      const phoneNumberId = requiredEnvironment(
        "META_WHATSAPP_PHONE_NUMBER_ID",
      );
      const apiVersion = requiredEnvironment("META_GRAPH_API_VERSION");
      const response = await fetch(
        buildMetaMessagesUrl(apiVersion, phoneNumberId),
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(
            buildMetaTextMessageBody(endpoint.address, message.message),
          ),
        },
      );
      const result = await safeJson(response);
      if (!response.ok) {
        throw new SafeMetaTransportError(
          metaFailureCode(result, response.status),
          "Meta Cloud API rejected or failed the WhatsApp message request",
        );
      }
      const firstMessage = firstRecord(result?.messages);
      const providerMessageId = optionalText(firstMessage?.id, 300);
      if (!providerMessageId) {
        throw new SafeMetaTransportError(
          "missing_provider_id",
          "Meta accepted no provider message identifier",
        );
      }
      const providerStatus =
        optionalText(firstMessage?.message_status, 80) ?? "accepted";
      const acceptedAt = Date.now();
      await ctx.runMutation(
        internal.transportMessages.markProviderAccepted,
        {
          transportMessageId: message._id,
          providerMessageId,
          providerStatus,
          acceptedAt,
        },
      );
      return {
        transportMessageId: message._id,
        providerMessageId,
        providerStatus,
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

class SafeMetaTransportError extends Error {
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
    throw new SafeMetaTransportError(
      "missing_configuration",
      "Meta development transport is not configured",
    );
  }
  return value;
}

async function safeJson(response: Response) {
  try {
    const value: unknown = await response.json();
    return record(value);
  } catch {
    return undefined;
  }
}

function metaFailureCode(
  result: Record<string, unknown> | undefined,
  status: number,
) {
  const error = record(result?.error);
  const providerCode = optionalText(error?.code, 60);
  return providerCode ? `meta_${providerCode}` : `http_${status}`;
}

function firstRecord(value: unknown) {
  return Array.isArray(value) && value.length ? record(value[0]) : undefined;
}

function record(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function optionalText(value: unknown, maxLength: number) {
  const clean =
    typeof value === "string"
      ? value.trim()
      : typeof value === "number"
        ? String(value)
        : "";
  return clean ? clean.slice(0, maxLength) : undefined;
}

function safeFailure(error: unknown) {
  if (error instanceof SafeMetaTransportError) {
    return { code: error.code, summary: error.message };
  }
  return {
    code: "provider_error",
    summary: "Meta Cloud API rejected or failed the WhatsApp message request",
  };
}
