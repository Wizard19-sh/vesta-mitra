import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { composeMitraMessage, type AeviaLanguage } from "./aeviaSetup";
import type { BetaRecipient } from "./betaRecipients";
import { resolveMemberSalutation } from "./mitraSalutation";

export type ProvenW4Result = {
  runKey: string;
  stateFile?: string;
  runId?: string;
  evidenceId?: string;
  providerStatus?: string;
  providerMessageId?: string;
  instruction?: string;
  preparedToken?: string;
};

type PreparedTokenPayload = {
  runKey: string;
  recipientId: string;
  agent: "mitra" | "tarla";
  ownerKey?: string;
  executionId?: string;
  previewDigest?: string;
};

type BetaMitraContext = {
  householdId: string;
  memberId: string;
  parentId: string;
  endpointId: string;
  timezone: string;
  displayName: string;
  preferredSalutation?: string;
  language: AeviaLanguage;
};

type BetaTarlaPrepared = {
  ownerKey: string;
  executionId: string;
  runId?: string;
  instruction: string;
};

type DispatchDetail = {
  run?: { runId?: string } | null;
  transportMessages: Array<{ status?: string; providerMessageId?: string }>;
  outboundMessages: Array<{ status?: string; providerMessageId?: string }>;
};

export async function prepareProvenW4(input: { recipient: BetaRecipient; agent: "mitra" | "tarla" }) {
  const runKey = randomUUID();
  if (input.agent === "mitra") {
    const context = await resolveBetaMitraContext(input.recipient);
    const instruction = composeBetaMitraInstruction(context);
    return {
      runKey,
      instruction,
      preparedToken: sign({
        runKey,
        recipientId: input.recipient.id,
        agent: input.agent,
        previewDigest: digest(instruction),
      }),
    };
  }
  const payload = await prepareTarlaFromConvex(input.recipient);
  return {
    runKey,
    preparedToken: sign({
      runKey,
      recipientId: input.recipient.id,
      agent: input.agent,
      ownerKey: payload.ownerKey,
      executionId: payload.executionId,
    }),
    preparedPayloadId: payload.executionId,
    runId: payload.runId,
    instruction: payload.instruction,
  };
}

export async function executeProvenW4(input: {
  recipient: BetaRecipient;
  agent: "mitra" | "tarla";
  preparedToken: string;
}): Promise<ProvenW4Result> {
  const prepared = verify(input.preparedToken, input.recipient.id, input.agent);
  const runKey = prepared.runKey;
  const mitraContext = input.agent === "mitra" ? await resolveBetaMitraContext(input.recipient) : undefined;
  const expectedMitraInstruction = mitraContext ? composeBetaMitraInstruction(mitraContext) : undefined;
  if (expectedMitraInstruction && prepared.previewDigest !== digest(expectedMitraInstruction)) {
    throw new Error("Prepared Mitra message is stale; prepare again");
  }
  const payload = input.agent === "mitra"
    ? await executeMitraFromConvex(input.recipient, mitraContext!, expectedMitraInstruction!)
    : await executeTarlaFromConvex(prepared);
  const instruction = payload.instruction ?? expectedMitraInstruction;
  if (input.agent === "mitra" && (!instruction || prepared.previewDigest !== digest(instruction))) {
    throw new Error("Dispatched Mitra text did not match the prepared preview");
  }
  return {
    runKey,
    runId: payload.runId,
    evidenceId: payload.runId ? `EVD-RUN-${payload.runId}` : undefined,
    providerStatus: payload.providerStatus,
    providerMessageId: payload.providerMessageId,
    instruction,
  };
}

async function resolveBetaMitraContext(recipient: BetaRecipient): Promise<BetaMitraContext> {
  if (!recipient.ownerKey) throw new Error("Selected recipient is not linked to a shared household");
  const client = convex();
  const context = await client.query(
    makeFunctionReference<"query">("m5:getBetaMitraRecipientContext"),
    {
      ownerKey: recipient.ownerKey,
      address: recipient.e164,
      displayName: recipient.displayName,
      householdLabel: recipient.label,
    },
  ) as BetaMitraContext | null;
  if (!context) throw new Error("Selected recipient has no ready, consented Mitra member record");
  return context;
}

function convex() {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!convexUrl) throw new Error("Convex development URL is not configured");
  return new ConvexHttpClient(convexUrl);
}

async function prepareTarlaFromConvex(recipient: BetaRecipient): Promise<BetaTarlaPrepared> {
  if (!recipient.ownerKey) throw new Error("Selected recipient is not linked to a shared household");
  const client = convex();
  const session = await client.query(
    makeFunctionReference<"query">("m5:getSession"),
    { ownerKey: recipient.ownerKey },
  ) as {
    setup?: { tarla?: { latestDayPlan?: { _id: string; status: string; approvedAt?: number }; cookingPeople?: Array<{
      endpoint?: { _id: string; address: string };
      member?: unknown;
      cookState?: unknown;
    }> } | null };
  } | null;
  const plan = session?.setup?.tarla?.latestDayPlan;
  if (!plan || plan.status !== "scheduled" || !plan.approvedAt) {
    throw new Error("Selected recipient has no approved/current Tarla plan");
  }
  const cookingPerson = session.setup?.tarla?.cookingPeople?.find(
    (item) => item.endpoint?.address === recipient.e164 && item.member && item.cookState,
  );
  if (!cookingPerson?.endpoint) {
    throw new Error("Selected recipient is not linked to the approved plan's cooking person");
  }
  const detail = await client.query(
    makeFunctionReference<"query">("tarlaDayPlanning:getDayPlan"),
    { ownerKey: recipient.ownerKey, dayPlanId: plan._id },
  ) as { executions: Array<{ _id: string; communicationEndpointId: string; status: string; instruction?: string }> };
  const execution = detail.executions.find(
    (item) => item.communicationEndpointId === cookingPerson.endpoint!._id && item.status === "instruction_ready" && item.instruction,
  );
  if (!execution?.instruction) throw new Error("Approved plan has no prepared instruction for this cooking person");
  const executionDetail = await client.query(
    makeFunctionReference<"query">("tarlaDayPlanning:getDayExecution"),
    { ownerKey: recipient.ownerKey, executionId: execution._id },
  ) as DispatchDetail;
  return { ownerKey: recipient.ownerKey, executionId: execution._id, runId: executionDetail.run?.runId, instruction: execution.instruction };
}

async function executeTarlaFromConvex(prepared: PreparedTokenPayload) {
  const client = convex();
  const sent = await client.mutation(
    makeFunctionReference<"mutation">("tarlaDayPlanning:sendPreparedDayInstruction"),
    { ownerKey: prepared.ownerKey!, executionId: prepared.executionId! },
  ) as { runId?: string; instruction: string };
  const detail = await waitFor(
    () => client.query(makeFunctionReference<"query">("tarlaDayPlanning:getDayExecution"), {
      ownerKey: prepared.ownerKey!, executionId: prepared.executionId!,
    }) as Promise<DispatchDetail>,
    (value) => value.transportMessages.some((message) => ["accepted", "sent", "delivered", "read", "failed"].includes(message.status ?? "")) || value.outboundMessages.length > 0,
    "the prepared Tarla instruction dispatch",
  );
  const provider = detail.transportMessages[0] ?? detail.outboundMessages[0];
  return { runId: sent.runId, instruction: sent.instruction, providerStatus: provider?.status ?? "accepted", providerMessageId: provider?.providerMessageId };
}

async function executeMitraFromConvex(recipient: BetaRecipient, context: BetaMitraContext, instruction: string) {
  if (!recipient.ownerKey) throw new Error("Selected recipient is not linked to a shared household");
  const client = convex();
  const routine = await client.mutation(
    makeFunctionReference<"mutation">("mitraRoutines:createScheduledRoutine"),
    {
      ownerKey: recipient.ownerKey,
      householdId: context.householdId,
      memberId: context.memberId,
      recipientMemberId: context.memberId,
      recipientAudience: "senior",
      parentId: context.parentId,
      communicationEndpointId: context.endpointId,
      type: "Walk / activity",
      label: "evening walk",
      timing: { kind: "once_scheduled", timezone: context.timezone, scheduledAt: Date.now() + 1_000 },
      responseWindowMs: 10 * 60 * 1_000,
    },
  ) as { routineId: string };
  const detail = await waitFor(
    async () => {
      const instances = await client.query(makeFunctionReference<"query">("mitraRoutines:listRoutineInstances"), {
        ownerKey: recipient.ownerKey!, routineId: routine.routineId,
      }) as Array<{ _id: string }>;
      return instances[0]
        ? client.query(makeFunctionReference<"query">("mitraRoutines:getRoutineInstance"), {
            ownerKey: recipient.ownerKey!, checkInId: instances[0]._id,
          }) as Promise<DispatchDetail>
        : null;
    },
    (value): value is DispatchDetail => Boolean(value && (value.transportMessages.some((message) => ["accepted", "sent", "delivered", "read", "failed"].includes(message.status ?? "")) || value.outboundMessages.length > 0)),
    "the prepared Mitra reminder dispatch",
  );
  if (!detail) throw new Error("Mitra reminder did not create a routine instance");
  const provider = detail.transportMessages[0] ?? detail.outboundMessages[0];
  return { runId: detail.run?.runId, instruction, providerStatus: provider?.status ?? "accepted", providerMessageId: provider?.providerMessageId };
}

async function waitFor<T>(read: () => Promise<T>, ready: (value: T) => boolean, description: string) {
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    const value = await read();
    if (ready(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

function composeBetaMitraInstruction(context: BetaMitraContext) {
  const salutation = resolveMemberSalutation({
    preferredSalutation: context.preferredSalutation,
    displayName: context.displayName,
  });
  return composeMitraMessage({
    recipientSalutation: salutation,
    seniorSalutation: salutation,
    label: "evening walk",
    type: "Walk / activity",
    language: context.language,
    context: { agent: "mitra", audience: "senior", surface: "whatsapp", moment: "reminder" },
  });
}

function digest(value: string) {
  return createHmac("sha256", "aevia-beta-preview-v1").update(value).digest("base64url");
}

function sign(payload: PreparedTokenPayload) {
  const key = process.env.BETA_ADMIN_KEY?.trim();
  if (!key) throw new Error("Beta admin key is not configured");
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", key).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verify(token: string, recipientId: string, agent: string) {
  const [encoded, supplied] = token.split(".");
  if (!encoded || !supplied) throw new Error("Prepared payload token is invalid");
  const key = process.env.BETA_ADMIN_KEY?.trim();
  if (!key) throw new Error("Beta admin key is not configured");
  const expected = createHmac("sha256", key).update(encoded).digest("base64url");
  const left = Buffer.from(supplied); const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new Error("Prepared payload does not match this recipient and agent");
  let payload: PreparedTokenPayload;
  try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as PreparedTokenPayload; }
  catch { throw new Error("Prepared payload token is invalid"); }
  if (!/^[0-9a-f-]{36}$/i.test(payload.runKey) || payload.recipientId !== recipientId || payload.agent !== agent) {
    throw new Error("Prepared payload does not match this recipient and agent");
  }
  if (agent === "tarla" && (!payload.ownerKey || !payload.executionId)) {
    throw new Error("Prepared Tarla payload reference is missing; prepare again");
  }
  if (agent === "mitra" && !payload.previewDigest) {
    throw new Error("Prepared Mitra preview reference is missing; prepare again");
  }
  return payload;
}
