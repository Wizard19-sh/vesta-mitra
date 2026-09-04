import "server-only";

import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import type { BetaRecipient } from "./betaRecipients";

export type ProvenW4Result = {
  runKey: string;
  stateFile: string;
  runId?: string;
  evidenceId?: string;
  providerStatus?: string;
  providerMessageId?: string;
};

export async function executeProvenW4(input: {
  recipient: BetaRecipient;
  agent: "mitra" | "tarla";
}): Promise<ProvenW4Result> {
  const runKey = randomUUID();
  const script = input.agent === "mitra"
    ? "scripts/verify-w4-meta-live.mjs"
    : "scripts/verify-w4-meta-tarla-live.mjs";
  const stateFile = input.agent === "mitra"
    ? `.beta-w4-mitra-${runKey}.json`
    : `.beta-w4-tarla-${runKey}.json`;
  const env = {
    ...process.env,
    // This is process-local. It never changes the regression W4 environment key.
    W4_META_TEST_RECIPIENT_E164: input.recipient.e164,
    ...(input.agent === "mitra"
      ? { W4_META_LIVE_STATE_PATH: stateFile, W4_META_SCHEDULE_DELAY_MS: "1000" }
      : { W4_META_TARLA_STATE_PATH: stateFile, W4_META_TARLA_LEAD_MINUTES: "1" }),
  };
  const result = await runNode(script, ["prepare"], env);
  const payload = lastJson(result.stdout);
  if (!payload) throw new Error("The proven W4 runner returned no structured result");
  return {
    runKey,
    stateFile,
    runId: text(payload.runId),
    evidenceId: text(payload.evidenceId),
    providerStatus: text(payload.providerStatus),
    providerMessageId: text(payload.providerMessageId),
  };
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
