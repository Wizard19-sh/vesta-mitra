import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import twilio from "twilio";
import {
  createOutboundIdempotencyKey,
  shouldApplyDeliveryState,
} from "../lib/messageTransport.ts";
import {
  buildMetaMessagesUrl,
  buildMetaTextMessageBody,
  formatMetaRecipientAddress,
  normalizeMetaWebhook,
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from "../lib/metaWhatsAppTransport.ts";
import {
  formatTwilioWhatsAppAddress,
  normalizeTwilioDeliveryState,
  normalizeTwilioDeliveryStatus,
  normalizeTwilioInbound,
} from "../lib/twilioTransport.ts";

const passed = [];
const webhookExposure = {
  twilio: "not_checked",
  meta: "not_checked",
};

verify("WhatsApp address normalization", () => {
  assert.equal(formatTwilioWhatsAppAddress("+15555550100"), "whatsapp:+15555550100");
  assert.equal(
    formatTwilioWhatsAppAddress("whatsapp:+15555550100"),
    "whatsapp:+15555550100",
  );
  assert.throws(() => formatTwilioWhatsAppAddress("9876543210"), /E\.164/);
});

verify("Inbound raw text preservation", () => {
  const rawContent = "  Haan medicine le li.  ";
  const inbound = normalizeTwilioInbound(
    {
      MessageSid: "SM_TEST_MESSAGE_01",
      AccountSid: "AC_TEST_ACCOUNT",
      From: "whatsapp:+15555550100",
      To: "whatsapp:+15555550101",
      Body: rawContent,
      OriginalRepliedMessageSid: "SM_TEST_MESSAGE_02",
    },
    1_788_267_600_000,
  );
  assert.equal(inbound.rawContent, rawContent);
  assert.equal(inbound.signalType, "text");
  assert.equal(
    inbound.metadata.inReplyToMessageId,
    "SM_TEST_MESSAGE_02",
  );
});

verify("Delivery payload normalization", () => {
  const delivery = normalizeTwilioDeliveryStatus({
    MessageSid: "SM_TEST_MESSAGE_03",
    MessageStatus: "delivered",
    AccountSid: "AC_TEST_ACCOUNT",
  });
  assert.equal(delivery.providerStatus, "delivered");
  assert.equal(normalizeTwilioDeliveryState("undelivered"), "failed");
});

verify("Monotonic delivery state", () => {
  assert.equal(shouldApplyDeliveryState("accepted", "sent"), true);
  assert.equal(shouldApplyDeliveryState("delivered", "sent"), false);
  assert.equal(shouldApplyDeliveryState("read", "failed"), false);
  assert.equal(shouldApplyDeliveryState("accepted", "failed"), true);
  assert.equal(shouldApplyDeliveryState("failed", "sent"), false);
});

verify("Outbound duplicate key", () => {
  const input = {
    checkInId: "check-in-1",
    purpose: "routine_reminder",
    message: "Aaj walk ka reminder hai.",
  };
  const first = createOutboundIdempotencyKey(input);
  assert.equal(createOutboundIdempotencyKey(input), first);
  assert.notEqual(
    createOutboundIdempotencyKey({ ...input, message: "Updated reminder" }),
    first,
  );
});

verify("Official Twilio signature validation", () => {
  const authToken = "fake-test-auth-token";
  const url =
    "https://example.convex.site/webhooks/twilio/whatsapp/inbound";
  const params = {
    AccountSid: "AC_TEST_ACCOUNT",
    MessageSid: "SM_TEST_MESSAGE_04",
    From: "whatsapp:+15555550100",
    To: "whatsapp:+15555550101",
    Body: "Palak nahi hai.",
  };
  const signature = twilio.getExpectedTwilioSignature(authToken, url, params);
  assert.equal(twilio.validateRequest(authToken, signature, url, params), true);
  assert.equal(
    twilio.validateRequest(authToken, signature, url, {
      ...params,
      Body: "Changed body",
    }),
    false,
  );
});

verify("Meta outbound request normalization", () => {
  assert.equal(formatMetaRecipientAddress("+15555550100"), "15555550100");
  assert.equal(
    buildMetaMessagesUrl("v99.0", "123456789"),
    "https://graph.facebook.com/v99.0/123456789/messages",
  );
  assert.deepEqual(
    buildMetaTextMessageBody(
      "whatsapp:+15555550100",
      "Aaj walk ka reminder hai.",
    ),
    {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "15555550100",
      type: "text",
      text: {
        preview_url: false,
        body: "Aaj walk ka reminder hai.",
      },
    },
  );
});

verify("Meta challenge verification", () => {
  assert.equal(
    verifyMetaWebhookChallenge(
      {
        mode: "subscribe",
        verifyToken: "fake-meta-verify-token",
        challenge: "test-challenge",
      },
      "fake-meta-verify-token",
    ),
    "test-challenge",
  );
  assert.equal(
    verifyMetaWebhookChallenge(
      {
        mode: "subscribe",
        verifyToken: "wrong-token",
        challenge: "test-challenge",
      },
      "fake-meta-verify-token",
    ),
    null,
  );
});

await verifyAsync("Meta HMAC webhook signature", async () => {
  const appSecret = "fake-meta-app-secret";
  const rawBody = JSON.stringify({ object: "whatsapp_business_account" });
  const signature = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  assert.equal(
    await verifyMetaWebhookSignature(rawBody, signature, appSecret),
    true,
  );
  assert.equal(
    await verifyMetaWebhookSignature(`${rawBody} `, signature, appSecret),
    false,
  );
});

verify("Meta inbound and delivery normalization", () => {
  const rawContent = "  Haan medicine le li.  ";
  const webhook = normalizeMetaWebhook(
    {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "123456789",
          changes: [
            {
              field: "messages",
              value: {
                metadata: {
                  display_phone_number: "+15555550101",
                  phone_number_id: "987654321",
                },
                messages: [
                  {
                    from: "15555550100",
                    id: "wamid.TEST_INBOUND_TEXT",
                    timestamp: "1788276600",
                    type: "text",
                    context: { id: "wamid.TEST_OUTBOUND" },
                    text: { body: rawContent },
                  },
                  {
                    from: "15555550100",
                    id: "wamid.TEST_INBOUND_REACTION",
                    timestamp: "1788276601",
                    type: "reaction",
                    reaction: {
                      message_id: "wamid.TEST_OUTBOUND",
                      emoji: "✅",
                    },
                  },
                ],
                statuses: [
                  {
                    id: "wamid.TEST_OUTBOUND",
                    status: "delivered",
                    timestamp: "1788276599",
                    recipient_id: "15555550100",
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    1_788_276_700_000,
  );
  assert.equal(webhook.messages[0].rawContent, rawContent);
  assert.equal(webhook.messages[0].metadata.provider, "meta");
  assert.equal(
    webhook.messages[0].metadata.inReplyToMessageId,
    "wamid.TEST_OUTBOUND",
  );
  assert.equal(webhook.messages[1].signalType, "reaction");
  assert.equal(webhook.messages[1].rawContent, "✅");
  assert.equal(
    webhook.messages[1].metadata.reactionToMessageId,
    "wamid.TEST_OUTBOUND",
  );
  assert.equal(webhook.deliveries[0].normalizedStatus, "delivered");
});

await verifyDevelopmentWebhookGuard();

console.log(
  JSON.stringify(
    {
      evalSet: "provider_transport_preflight_w4",
      passed: passed.length,
      failed: 0,
      cases: passed,
      webhookExposure,
      realMessageSent: false,
    },
    null,
    2,
  ),
);

function verify(name, check) {
  check();
  passed.push(name);
}

async function verifyAsync(name, check) {
  await check();
  passed.push(name);
}

async function verifyDevelopmentWebhookGuard() {
  const environmentPath = fileURLToPath(new URL("../.env.local", import.meta.url));
  if (!existsSync(environmentPath)) {
    webhookExposure.twilio = "local_environment_unavailable";
    webhookExposure.meta = "local_environment_unavailable";
    passed.push("Development webhook guard skipped: no local Convex environment");
    return;
  }
  const environment = readEnvironmentFile(environmentPath);
  const deployment = process.env.CONVEX_DEPLOYMENT ?? environment.CONVEX_DEPLOYMENT;
  const convexUrl =
    process.env.NEXT_PUBLIC_CONVEX_URL ??
    process.env.CONVEX_URL ??
    environment.NEXT_PUBLIC_CONVEX_URL ??
    environment.CONVEX_URL;
  if (!deployment?.startsWith("dev:") || !convexUrl) {
    throw new Error("W4 webhook guard verification requires a Convex dev deployment");
  }
  const siteUrl = convexUrl
    .replace(/\.convex\.cloud\/?$/, ".convex.site")
    .replace(/\/$/, "");
  assert.notEqual(siteUrl, convexUrl);
  const endpoint = `${siteUrl}/webhooks/twilio/whatsapp/inbound`;
  const formBody = new URLSearchParams({
    AccountSid: "AC_TEST_ACCOUNT",
    MessageSid: "SM_TEST_MESSAGE_05",
    From: "whatsapp:+15555550100",
    To: "whatsapp:+15555550101",
    Body: "Synthetic invalid webhook",
  }).toString();
  const missingSignature = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: formBody,
  });
  if (missingSignature.status === 404) {
    webhookExposure.twilio = "not_deployed";
    passed.push("Development webhook is not exposed before Phase 3 approval");
    return;
  }
  assert.equal(missingSignature.status, 403);
  const invalidSignature = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-twilio-signature": "invalid-test-signature",
    },
    body: formBody,
  });
  assert.ok(
    [403, 503].includes(invalidSignature.status),
    `Expected an invalid or unconfigured webhook response, received ${invalidSignature.status}`,
  );
  webhookExposure.twilio = "deployed_and_guarded";
  passed.push("Twilio development webhook rejects unauthenticated requests");

  const metaEndpoint = `${siteUrl}/webhooks/meta/whatsapp`;
  const metaChallenge = await fetch(
    `${metaEndpoint}?hub.mode=subscribe&hub.verify_token=fake-test-token&hub.challenge=test-challenge`,
  );
  if (metaChallenge.status === 404) {
    webhookExposure.meta = "not_deployed";
    passed.push("Meta development webhook is not exposed before approval");
    return;
  }
  assert.ok(
    [403, 503].includes(metaChallenge.status),
    `Expected a rejected or unconfigured Meta challenge, received ${metaChallenge.status}`,
  );
  const unsignedMetaPost = await fetch(metaEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ object: "whatsapp_business_account" }),
  });
  assert.equal(unsignedMetaPost.status, 403);
  webhookExposure.meta = "deployed_and_guarded";
  passed.push("Meta development webhook rejects unauthenticated requests");
}

function readEnvironmentFile(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return values;
}
