import { httpRouter } from "convex/server";
import {
  normalizeMetaPhoneNumberId,
  normalizeMetaWebhook,
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from "../lib/metaWhatsAppTransport";
import {
  normalizeTwilioDeliveryState,
  normalizeTwilioDeliveryStatus,
  normalizeTwilioInbound,
} from "../lib/twilioTransport";
import { api, internal } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
  path: "/webhooks/meta/whatsapp",
  method: "GET",
  handler: httpAction(async (_ctx, request) => {
    const verifyToken = process.env.META_WHATSAPP_VERIFY_TOKEN;
    if (!verifyToken) {
      return safeResponse("Meta webhook is not configured", 503);
    }
    const url = new URL(request.url);
    const challenge = verifyMetaWebhookChallenge(
      {
        mode: url.searchParams.get("hub.mode") ?? undefined,
        verifyToken: url.searchParams.get("hub.verify_token") ?? undefined,
        challenge: url.searchParams.get("hub.challenge") ?? undefined,
      },
      verifyToken,
    );
    if (!challenge) return safeResponse("Meta webhook verification failed", 403);
    return new Response(challenge, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }),
});

http.route({
  path: "/webhooks/meta/whatsapp",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const receivedAt = Date.now();
    console.info("Meta WhatsApp webhook received", { receivedAt });
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.toLocaleLowerCase().includes("application/json")) {
      console.warn("Meta WhatsApp webhook rejected", {
        reason: "unsupported_content_type",
      });
      return safeResponse("Unsupported webhook content type", 415);
    }
    const signature = request.headers
      .get("x-hub-signature-256")
      ?.trim();
    if (!signature) {
      console.warn("Meta WhatsApp webhook rejected", {
        reason: "missing_signature",
      });
      return safeResponse("Missing webhook signature", 403);
    }
    const appSecret = process.env.META_WHATSAPP_APP_SECRET;
    const configuredWabaId = process.env.META_WHATSAPP_WABA_ID?.trim();
    const configuredPhoneNumberId =
      process.env.META_WHATSAPP_PHONE_NUMBER_ID?.trim();
    if (!appSecret || !configuredWabaId || !configuredPhoneNumberId) {
      console.warn("Meta WhatsApp webhook rejected", {
        reason: "missing_server_configuration",
      });
      return safeResponse("Meta webhook is not configured", 503);
    }
    let expectedWabaId: string;
    let expectedPhoneNumberId: string;
    try {
      expectedWabaId = normalizeMetaPhoneNumberId(configuredWabaId);
      expectedPhoneNumberId = normalizeMetaPhoneNumberId(
        configuredPhoneNumberId,
      );
    } catch {
      console.warn("Meta WhatsApp webhook rejected", {
        reason: "invalid_server_configuration",
      });
      return safeResponse("Meta webhook configuration is invalid", 503);
    }
    const rawBody = await request.text();
    if (!rawBody || rawBody.length > 1_000_000) {
      console.warn("Meta WhatsApp webhook rejected", {
        reason: "invalid_body_size",
      });
      return safeResponse("Invalid Meta webhook body", 400);
    }
    if (!(await verifyMetaWebhookSignature(rawBody, signature, appSecret))) {
      console.warn("Meta WhatsApp webhook rejected", {
        reason: "invalid_signature",
      });
      return safeResponse("Invalid webhook signature", 403);
    }
    const validatedAt = Date.now();
    let webhook;
    try {
      webhook = normalizeMetaWebhook(JSON.parse(rawBody), receivedAt);
    } catch {
      console.warn("Meta WhatsApp webhook rejected", {
        reason: "invalid_payload",
      });
      return safeResponse("Invalid Meta webhook payload", 400);
    }
    const configuredEvent = (event: {
      wabaId: string;
      phoneNumberId: string;
    }) =>
      event.wabaId === expectedWabaId &&
      event.phoneNumberId === expectedPhoneNumberId;
    const configuredDeliveries = webhook.deliveries.filter(configuredEvent);
    const configuredMessages = webhook.messages.filter(configuredEvent);
    console.info("Meta WhatsApp webhook validated", {
      deliveryCount: webhook.deliveries.length,
      messageCount: webhook.messages.length,
      configuredDeliveryCount: configuredDeliveries.length,
      configuredMessageCount: configuredMessages.length,
    });

    for (const delivery of configuredDeliveries) {
      await ctx.runMutation(internal.transportMessages.updateDeliveryStatus, {
        provider: "meta",
        providerMessageId: delivery.providerMessageId,
        providerStatus: delivery.providerStatus,
        normalizedStatus: delivery.normalizedStatus,
        failureCode: delivery.failureCode,
        timestamp: delivery.timestamp,
      });
    }
    for (const inbound of configuredMessages) {
      const referencedMessageId =
        inbound.metadata.inReplyToMessageId ??
        inbound.metadata.reactionToMessageId;
      const route = await ctx.runQuery(internal.transportInbound.resolveRoute, {
        senderAddress: inbound.senderAddress,
        channel: inbound.channel,
        provider: "meta",
        inReplyToProviderMessageId: referencedMessageId,
      });
      const metadata = {
        inReplyToMessageId: inbound.metadata.inReplyToMessageId,
        reactionToMessageId: inbound.metadata.reactionToMessageId,
        provider: "meta",
        webhookReceivedAt: receivedAt,
        webhookValidatedAt: validatedAt,
      };
      console.info("Meta WhatsApp inbound route resolved", {
        matched: Boolean(route),
        agent: route?.agent ?? "unmatched",
        signalType: inbound.signalType,
      });
      if (!inbound.rawContent && inbound.signalType === "reaction") {
        await ctx.runMutation(internal.transportInbound.persistUnmatched, {
          senderAddress: inbound.senderAddress,
          channel: inbound.channel,
          signalType: inbound.signalType,
          rawContent: inbound.rawContent,
          messageId: inbound.providerMessageId,
          timestamp: inbound.timestamp,
          endpointId: route?.endpointId,
          metadata,
        });
      } else if (route?.agent === "mitra") {
        await ctx.runMutation(api.mitraInbound.ingestSignal, {
          ownerKey: route.ownerKey,
          senderAddress: inbound.senderAddress,
          channel: inbound.channel,
          signalType: inbound.signalType,
          rawContent: inbound.rawContent,
          messageId: inbound.providerMessageId,
          timestamp: inbound.timestamp,
          metadata,
        });
      } else if (route?.agent === "tarla") {
        await ctx.runMutation(api.tarlaInbound.ingestCookSignal, {
          ownerKey: route.ownerKey,
          senderAddress: inbound.senderAddress,
          channel: inbound.channel,
          signalType: inbound.signalType,
          rawContent: inbound.rawContent,
          messageId: inbound.providerMessageId,
          timestamp: inbound.timestamp,
          metadata,
        });
      } else {
        await ctx.runMutation(internal.transportInbound.persistUnmatched, {
          senderAddress: inbound.senderAddress,
          channel: inbound.channel,
          signalType: inbound.signalType,
          rawContent: inbound.rawContent,
          messageId: inbound.providerMessageId,
          timestamp: inbound.timestamp,
          endpointId: route?.endpointId,
          metadata,
        });
      }
    }
    return new Response(null, { status: 200 });
  }),
});

http.route({
  path: "/webhooks/twilio/whatsapp/inbound",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const receivedAt = Date.now();
    const parsed = await parseTwilioForm(request);
    if (parsed instanceof Response) return parsed;
    const validation = await ctx.runAction(
      internal.twilioTransport.validateWebhook,
      {
        kind: "inbound",
        requestUrl: request.url,
        signature: parsed.signature,
        params: parsed.entries,
      },
    );
    if (!validation.configured) {
      return safeResponse("Webhook is not configured", 503);
    }
    if (!validation.valid) {
      return safeResponse("Invalid webhook signature", 403);
    }
    const validatedAt = Date.now();
    let inbound;
    try {
      inbound = normalizeTwilioInbound(parsed.params, receivedAt);
    } catch {
      return safeResponse("Invalid Twilio inbound payload", 400);
    }
    const route = await ctx.runQuery(internal.transportInbound.resolveRoute, {
      senderAddress: inbound.senderAddress,
      channel: inbound.channel,
      provider: "twilio",
      inReplyToProviderMessageId: inbound.metadata.inReplyToMessageId,
    });
    const metadata = {
      inReplyToMessageId: inbound.metadata.inReplyToMessageId,
      provider: "twilio",
      webhookReceivedAt: receivedAt,
      webhookValidatedAt: validatedAt,
    };
    if (route?.agent === "mitra") {
      await ctx.runMutation(api.mitraInbound.ingestSignal, {
        ownerKey: route.ownerKey,
        senderAddress: inbound.senderAddress,
        channel: inbound.channel,
        signalType: inbound.signalType,
        rawContent: inbound.rawContent,
        messageId: inbound.providerMessageId,
        timestamp: inbound.timestamp,
        metadata,
      });
    } else if (route?.agent === "tarla") {
      await ctx.runMutation(api.tarlaInbound.ingestCookSignal, {
        ownerKey: route.ownerKey,
        senderAddress: inbound.senderAddress,
        channel: inbound.channel,
        signalType: inbound.signalType,
        rawContent: inbound.rawContent,
        messageId: inbound.providerMessageId,
        timestamp: inbound.timestamp,
        metadata,
      });
    } else {
      await ctx.runMutation(internal.transportInbound.persistUnmatched, {
        senderAddress: inbound.senderAddress,
        channel: inbound.channel,
        signalType: inbound.signalType,
        rawContent: inbound.rawContent,
        messageId: inbound.providerMessageId,
        timestamp: inbound.timestamp,
        endpointId: route?.endpointId,
        metadata,
      });
    }
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { "content-type": "text/xml; charset=utf-8" },
      },
    );
  }),
});

http.route({
  path: "/webhooks/twilio/whatsapp/status",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const parsed = await parseTwilioForm(request);
    if (parsed instanceof Response) return parsed;
    const validation = await ctx.runAction(
      internal.twilioTransport.validateWebhook,
      {
        kind: "status",
        requestUrl: request.url,
        signature: parsed.signature,
        params: parsed.entries,
      },
    );
    if (!validation.configured) {
      return safeResponse("Status callback is not configured", 503);
    }
    if (!validation.valid) {
      return safeResponse("Invalid webhook signature", 403);
    }
    let delivery;
    try {
      delivery = normalizeTwilioDeliveryStatus(parsed.params);
    } catch {
      return safeResponse("Invalid Twilio status payload", 400);
    }
    await ctx.runMutation(internal.transportMessages.updateDeliveryStatus, {
      provider: "twilio",
      providerMessageId: delivery.providerMessageId,
      providerStatus: delivery.providerStatus,
      normalizedStatus: normalizeTwilioDeliveryState(
        delivery.providerStatus,
      ),
      failureCode: delivery.failureCode,
      timestamp: Date.now(),
    });
    return new Response(null, { status: 204 });
  }),
});

async function parseTwilioForm(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLocaleLowerCase().includes("application/x-www-form-urlencoded")) {
    return safeResponse("Unsupported webhook content type", 415);
  }
  const signature = request.headers.get("x-twilio-signature")?.trim();
  if (!signature) return safeResponse("Missing webhook signature", 403);
  const form = new URLSearchParams(await request.text());
  const entries = [...form.entries()].map(([key, value]) => ({ key, value }));
  if (entries.length === 0) return safeResponse("Empty webhook payload", 400);
  return {
    signature,
    entries,
    params: Object.fromEntries(entries.map(({ key, value }) => [key, value])),
  };
}

function safeResponse(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export default http;
