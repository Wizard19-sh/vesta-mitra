export type RecurrenceRule = {
  frequency: "daily" | "selected_days" | "weekly" | "monthly";
  time: string;
  daysOfWeek?: number[];
  dayOfMonth?: number;
};

export type RoutineTiming =
  | { kind: "once_now"; timezone: string }
  | { kind: "once_scheduled"; timezone: string; scheduledAt: number }
  | { kind: "recurring"; timezone: string; recurrence: RecurrenceRule };

export function firstOccurrenceAt(timing: RoutineTiming, now = Date.now()) {
  assertTimeZone(timing.timezone);
  if (timing.kind === "once_now") return now;
  if (timing.kind === "once_scheduled") {
    if (!Number.isFinite(timing.scheduledAt)) {
      throw new Error("Scheduled time must be a timestamp");
    }
    return Math.max(now, timing.scheduledAt);
  }
  validateRecurrence(timing.recurrence);
  return nextRecurringOccurrence(timing.recurrence, timing.timezone, now - 1);
}

export function nextOccurrenceAfter(
  timing: RoutineTiming,
  previousOccurrenceAt: number,
) {
  if (timing.kind !== "recurring") return undefined;
  assertTimeZone(timing.timezone);
  validateRecurrence(timing.recurrence);
  return nextRecurringOccurrence(
    timing.recurrence,
    timing.timezone,
    previousOccurrenceAt,
  );
}

export function legacyScheduleFromTiming(
  timing: RoutineTiming,
  occurrenceAt: number,
) {
  const local = zonedParts(occurrenceAt, timing.timezone);
  const base = {
    time: `${pad(local.hour)}:${pad(local.minute)}`,
    timeZone: timing.timezone,
  };
  if (timing.kind === "once_now" || timing.kind === "once_scheduled") {
    return {
      ...base,
      date: `${local.year}-${pad(local.month)}-${pad(local.day)}`,
    };
  }
  if (timing.recurrence.frequency === "monthly") {
    return { ...base, dayOfMonth: timing.recurrence.dayOfMonth };
  }
  if (timing.recurrence.frequency === "weekly") {
    const day = timing.recurrence.daysOfWeek?.[0];
    return { ...base, dayOfWeek: day === undefined ? undefined : dayName(day) };
  }
  return base;
}

export function localTimeForTimestamp(timestamp: number, timezone: string) {
  const local = zonedParts(timestamp, timezone);
  return {
    date: `${local.year}-${pad(local.month)}-${pad(local.day)}`,
    time: `${pad(local.hour)}:${pad(local.minute)}`,
    dayOfWeek: local.dayOfWeek,
  };
}

function nextRecurringOccurrence(
  recurrence: RecurrenceRule,
  timezone: string,
  after: number,
) {
  const { hour, minute } = parseTime(recurrence.time);
  const start = zonedParts(after, timezone);

  for (let offset = 0; offset <= 400; offset += 1) {
    const date = new Date(Date.UTC(start.year, start.month - 1, start.day + offset));
    const localDate = {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      dayOfWeek: date.getUTCDay(),
    };
    if (!matchesRecurrence(recurrence, localDate)) continue;

    try {
      const candidate = zonedDateTimeToTimestamp(
        { ...localDate, hour, minute },
        timezone,
      );
      if (candidate > after) return candidate;
    } catch {
      // A daylight-saving transition can remove one local time. Try the next day.
    }
  }
  throw new Error("Could not find the next recurrence within 400 days");
}

function matchesRecurrence(
  recurrence: RecurrenceRule,
  localDate: { day: number; dayOfWeek: number },
) {
  if (recurrence.frequency === "daily") return true;
  if (recurrence.frequency === "monthly") {
    return localDate.day === recurrence.dayOfMonth;
  }
  return recurrence.daysOfWeek?.includes(localDate.dayOfWeek) ?? false;
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
  throw new Error("The requested local time does not exist in this timezone");
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
  const year = value("year");
  const month = value("month");
  const day = value("day");
  return {
    year,
    month,
    day,
    hour: value("hour"),
    minute: value("minute"),
    dayOfWeek: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

function validateRecurrence(recurrence: RecurrenceRule) {
  parseTime(recurrence.time);
  if (recurrence.frequency === "selected_days") {
    validateDays(recurrence.daysOfWeek, true);
  }
  if (recurrence.frequency === "weekly") {
    validateDays(recurrence.daysOfWeek, true);
    if (recurrence.daysOfWeek?.length !== 1) {
      throw new Error("Weekly recurrence requires exactly one day of week");
    }
  }
  if (
    recurrence.frequency === "monthly" &&
    (!Number.isInteger(recurrence.dayOfMonth) ||
      recurrence.dayOfMonth === undefined ||
      recurrence.dayOfMonth < 1 ||
      recurrence.dayOfMonth > 31)
  ) {
    throw new Error("Monthly recurrence requires a day from 1 to 31");
  }
}

function validateDays(days: number[] | undefined, required: boolean) {
  if (required && (!days || days.length === 0)) {
    throw new Error("At least one day of week is required");
  }
  if (days?.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error("Days of week must be integers from 0 to 6");
  }
  if (days && new Set(days).size !== days.length) {
    throw new Error("Days of week must not contain duplicates");
  }
}

function parseTime(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new Error("Time must use 24-hour HH:mm format");
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function assertTimeZone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(0);
  } catch {
    throw new Error("Timezone must be a valid IANA timezone");
  }
}

function dayName(day: number) {
  return [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ][day];
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
