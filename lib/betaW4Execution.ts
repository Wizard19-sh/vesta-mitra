import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { composeMitraMessage, type AeviaLanguage } from "./aeviaSetup";
import type { BetaRecipient } from "./betaRecipients";
import { resolveMemberSalutation } from "./mitraSalutation";

export type ProvenW4Result = {
  runKey: string;
  stateFile: string;
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
  const stateFile = `.beta-w4-tarla-${runKey}.json`;
  const result = await runNode("scripts/verify-w4-meta-tarla-live.mjs", ["prepare_preview"], executionEnvironment(input.recipient, "tarla", stateFile));
  const payload = requiredPayload(result.stdout);
  return {
    runKey,
    stateFile,
    preparedToken: sign({
      runKey,
      recipientId: input.recipient.id,
      agent: input.agent,
      ownerKey: requiredText(payload.ownerKey, "prepared owner"),
      executionId: requiredText(payload.preparedPayloadId, "prepared payload"),
    }),
    preparedPayloadId: text(payload.preparedPayloadId),
    runId: text(payload.runId),
    instruction: text(payload.instruction),
  };
}

export async function executeProvenW4(input: {
  recipient: BetaRecipient;
  agent: "mitra" | "tarla";
  preparedToken: string;
}): Promise<ProvenW4Result> {
  const prepared = verify(input.preparedToken, input.recipient.id, input.agent);
  const runKey = prepared.runKey;
  const script = input.agent === "mitra"
    ? "scripts/verify-w4-meta-live.mjs"
    : "scripts/verify-w4-meta-tarla-live.mjs";
  const stateFile = input.agent === "mitra"
    ? `.beta-w4-mitra-${runKey}.json`
    : `.beta-w4-tarla-${runKey}.json`;
  const mitraContext = input.agent === "mitra" ? await resolveBetaMitraContext(input.recipient) : undefined;
  const expectedMitraInstruction = mitraContext ? composeBetaMitraInstruction(mitraContext) : undefined;
  if (expectedMitraInstruction && prepared.previewDigest !== digest(expectedMitraInstruction)) {
    throw new Error("Prepared Mitra message is stale; prepare again");
  }
  const command = input.agent === "mitra" ? "prepare_existing" : "send_prepared";
  const result = await runNode(script, [command], executionEnvironment(input.recipient, input.agent, stateFile, prepared, mitraContext));
  const payload = requiredPayload(result.stdout);
  const instruction = text(payload.instruction) ?? expectedMitraInstruction;
  if (input.agent === "mitra" && (!instruction || prepared.previewDigest !== digest(instruction))) {
    throw new Error("Dispatched Mitra text did not match the prepared preview");
  }
  return {
    runKey,
    stateFile,
    runId: text(payload.runId),
    evidenceId: text(payload.evidenceId),
    providerStatus: text(payload.providerStatus),
    providerMessageId: text(payload.providerMessageId),
    instruction,
  };
}

function executionEnvironment(
  recipient: BetaRecipient,
  agent: "mitra" | "tarla",
  stateFile: string,
  prepared?: PreparedTokenPayload,
  mitraContext?: BetaMitraContext,
) {
  return {
    ...process.env,
    W4_SKIP_LOCAL_STATE: "1",
    W4_META_TEST_RECIPIENT_E164: recipient.e164,
    ...(agent === "mitra"
      ? {
          W4_META_LIVE_STATE_PATH: stateFile,
          W4_META_SCHEDULE_DELAY_MS: "1000",
          ...(recipient.ownerKey ? { W4_META_EXISTING_OWNER_KEY: recipient.ownerKey } : {}),
          ...(mitraContext ? { W4_META_EXISTING_CONTEXT_JSON: JSON.stringify(mitraContext) } : {}),
        }
      : {
          W4_META_TARLA_STATE_PATH: stateFile,
          W4_META_TARLA_LEAD_MINUTES: "4",
          ...(prepared?.ownerKey && prepared.executionId
            ? {
                W4_META_TARLA_OWNER_KEY: prepared.ownerKey,
                W4_META_TARLA_EXECUTION_ID: prepared.executionId,
              }
            : {}),
        }),
  };
}

async function resolveBetaMitraContext(recipient: BetaRecipient): Promise<BetaMitraContext> {
  if (!recipient.ownerKey) throw new Error("Selected recipient is not linked to a shared household");
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  if (!convexUrl) throw new Error("Convex development URL is not configured");
  const client = new ConvexHttpClient(convexUrl);
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

function requiredPayload(output: string) {
  const payload = lastJson(output);
  if (!payload) throw new Error("The proven W4 runner returned no structured result");
  return payload;
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

function runNode(script: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(safeFailure(stderr, code))));
  });
}

function lastJson(output: string): Record<string, unknown> | undefined {
  const start = output.indexOf("{");
  if (start < 0) return undefined;
  try {
    const value: unknown = JSON.parse(output.slice(start));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch { return undefined; }
}

function safeFailure(stderr: string, code: number | null) {
  const text = stderr.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").trim();
  return text ? `Proven W4 runner failed (${code ?? "unknown"}): ${text.slice(-500)}` : `Proven W4 runner failed (${code ?? "unknown"})`;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function requiredText(value: unknown, label: string) {
  const result = text(value);
  if (!result) throw new Error(`The ${label} reference was not returned`);
  return result;
}
