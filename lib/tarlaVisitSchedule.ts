export function cookVisitTiming(input: {
  targetDate: string;
  arrivalTime: string;
  timezone: string;
  instructionLeadMinutes: number;
  now?: number;
}) {
  const [year, month, day] = parseDate(input.targetDate);
  const [hour, minute] = parseTime(input.arrivalTime);
  assertTimeZone(input.timezone);
  if (
    !Number.isInteger(input.instructionLeadMinutes) ||
    input.instructionLeadMinutes < 0
  ) {
    throw new Error("Instruction lead minutes must be a non-negative integer");
  }
  const arrivalAt = zonedDateTimeToTimestamp(
    { year, month, day, hour, minute },
    input.timezone,
  );
  const desiredInstructionAt =
    arrivalAt - input.instructionLeadMinutes * 60 * 1_000;
  return {
    arrivalAt,
    instructionAt: Math.max(input.now ?? Date.now(), desiredInstructionAt),
    desiredInstructionAt,
  };
}

export function dayOfWeekForDate(value: string) {
  const [year, month, day] = parseDate(value);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function zonedDateTimeToTimestamp(
  desired: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
  },
  timezone: string,
) {
  const desiredAsUtc = Date.UTC(
    desired.year,
    desired.month - 1,
    desired.day,
    desired.hour,
    desired.minute,
  );
  let candidate = desiredAsUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = zonedParts(candidate, timezone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
    );
    const correction = desiredAsUtc - actualAsUtc;
    if (correction === 0) return candidate;
    candidate += correction;
  }
  const final = zonedParts(candidate, timezone);
  if (
    final.year === desired.year &&
    final.month === desired.month &&
    final.day === desired.day &&
    final.hour === desired.hour &&
    final.minute === desired.minute
  ) {
    return candidate;
  }
  throw new Error("The cook visit local time does not exist in this timezone");
}

function zonedParts(timestamp: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(timestamp);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Target date must use YYYY-MM-DD format");
  const values = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
  const test = new Date(Date.UTC(values[0], values[1] - 1, values[2]));
  if (
    test.getUTCFullYear() !== values[0] ||
    test.getUTCMonth() + 1 !== values[1] ||
    test.getUTCDate() !== values[2]
  ) {
    throw new Error("Target date is invalid");
  }
  return values;
}

function parseTime(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new Error("Arrival time must use 24-hour HH:mm format");
  return [Number(match[1]), Number(match[2])] as const;
}

function assertTimeZone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(0);
  } catch {
    throw new Error("Timezone must be a valid IANA timezone");
  }
}
