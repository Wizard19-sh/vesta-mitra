export type BetaRecipientRole = "primary_user" | "senior" | "cook" | "other";

export type BetaRecipient = {
  id: string;
  displayName: string;
  e164: string;
  role: BetaRecipientRole;
  label?: string;
  enabled: boolean;
};

export type BetaRecipientView = Omit<BetaRecipient, "e164"> & { maskedPhone: string };

const roles = new Set<BetaRecipientRole>(["primary_user", "senior", "cook", "other"]);

/** Server-only registry parser. Never return a BetaRecipient directly to a browser. */
export function parseBetaRecipients(value: string | undefined): BetaRecipient[] {
  if (!value?.trim()) return [];
  let raw: unknown;
  try { raw = JSON.parse(value); } catch { throw new Error("BETA_META_RECIPIENTS_JSON must be valid JSON"); }
  if (!Array.isArray(raw) || raw.length !== 5) throw new Error("BETA_META_RECIPIENTS_JSON must contain exactly five recipients");
  const recipients = raw.map((item, index) => parseRecipient(item, index));
  if (new Set(recipients.map((recipient) => recipient.id)).size !== 5 || new Set(recipients.map((recipient) => recipient.e164)).size !== 5) {
    throw new Error("Beta recipient ids and phone numbers must be unique");
  }
  return recipients;
}

export function recipientView(recipient: BetaRecipient): BetaRecipientView {
  return {
    id: recipient.id,
    displayName: recipient.displayName,
    role: recipient.role,
    label: recipient.label,
    enabled: recipient.enabled,
    maskedPhone: maskE164(recipient.e164),
  };
}

export function maskE164(value: string) {
  const digits = value.replace(/\D/g, "");
  return `+${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function parseRecipient(value: unknown, index: number): BetaRecipient {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Beta recipient ${index + 1} must be an object`);
  const item = value as Record<string, unknown>;
  const id = text(item.id, `Beta recipient ${index + 1} id`, 80);
  const displayName = text(item.displayName, `Beta recipient ${index + 1} display name`, 120);
  const e164 = text(item.e164, `Beta recipient ${index + 1} E.164`, 20);
  const role = text(item.role, `Beta recipient ${index + 1} role`, 30) as BetaRecipientRole;
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id) || !/^\+[1-9]\d{7,14}$/.test(e164) || !roles.has(role)) throw new Error(`Beta recipient ${index + 1} is invalid`);
  if (typeof item.enabled !== "boolean") throw new Error(`Beta recipient ${index + 1} enabled must be boolean`);
  const label = item.label === undefined ? undefined : text(item.label, `Beta recipient ${index + 1} label`, 160);
  return { id, displayName, e164, role, label, enabled: item.enabled };
}

function text(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) throw new Error(`${label} is invalid`);
  return value.trim();
}
