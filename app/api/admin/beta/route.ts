import { NextRequest, NextResponse } from "next/server";
import { composeMitraMessage } from "../../../../lib/aeviaSetup";
import { parseBetaRecipients, recipientView } from "../../../../lib/betaRecipients";
import { executeProvenW4, prepareProvenW4 } from "../../../../lib/betaW4Execution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!authorised(request)) return denied();
  try {
    return NextResponse.json({
      recipients: parseBetaRecipients(process.env.BETA_META_RECIPIENTS_JSON).map(recipientView),
      scenarios: ["evening_walk", "tarla_palak_exception"],
    });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!authorised(request)) return denied();
  try {
    const body = await request.json() as { recipientId?: string; agent?: string; scenario?: string; confirmation?: string; preparedToken?: string };
    const recipient = parseBetaRecipients(process.env.BETA_META_RECIPIENTS_JSON).find((item) => item.id === body.recipientId);
    if (!recipient) return NextResponse.json({ error: "Selected recipient was not found" }, { status: 404 });
    if (!recipient.enabled) return NextResponse.json({ error: "Selected recipient is disabled" }, { status: 409 });
    if ((body.agent !== "mitra" && body.agent !== "tarla") || (body.scenario !== "evening_walk" && body.scenario !== "tarla_palak_exception")) {
      return NextResponse.json({ error: "Choose a supported agent and scenario" }, { status: 400 });
    }
    const mitraPreview = body.agent === "mitra"
      ? composeMitraMessage({ recipientSalutation: "Ji", seniorSalutation: "Ji", label: "evening walk", type: "Walk / activity", language: "Hinglish", context: { agent: "mitra", audience: "senior", surface: "whatsapp", moment: "reminder" } })
      : undefined;
    if (!body.preparedToken) {
      const prepared = await prepareProvenW4({ recipient, agent: body.agent });
      const preview = mitraPreview ?? prepared.instruction;
      if (!preview) throw new Error("Prepared outbound text was not generated");
      return NextResponse.json({ recipient: recipientView(recipient), preview, preparedToken: prepared.preparedToken, preparedPayloadId: prepared.preparedPayloadId ?? null, runId: prepared.runId ?? null, sendAllowed: true });
    }
    if (body.confirmation !== "SEND") return NextResponse.json({ error: "Type SEND to dispatch the prepared message" }, { status: 409 });
    const result = await executeProvenW4({ recipient, agent: body.agent, preparedToken: body.preparedToken });
    return NextResponse.json({
      recipient: recipientView(recipient),
      preview: result.instruction ?? mitraPreview,
      runId: result.runId ?? null,
      evidenceId: result.evidenceId ?? null,
      providerStatus: result.providerStatus ?? null,
      providerMessageId: result.providerMessageId ?? null,
      runKey: result.runKey,
      evidencePending: !result.evidenceId,
    });
  } catch (error) {
    return NextResponse.json({ error: message(error) }, { status: 400 });
  }
}

function authorised(request: NextRequest) {
  const expected = process.env.BETA_ADMIN_KEY?.trim();
  return Boolean(expected && request.headers.get("x-beta-admin-key")?.trim() === expected);
}
function denied() { return NextResponse.json({ error: "Internal beta access is required" }, { status: 401 }); }
function message(error: unknown) { return error instanceof Error ? error.message : "Beta runner configuration is invalid"; }
