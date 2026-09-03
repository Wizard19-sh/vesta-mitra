type TimedStep = {
  name: string;
  latencyMs?: number;
};

const HUMAN_WAIT_STEPS = new Set([
  "wait_for_reply",
  "wait_for_cook_reply",
  "wait_for_user_approval",
]);

const TRANSPORT_STEPS = new Set([
  "send_message",
  "send_revised_message",
]);

export function formatDuration(milliseconds: number | undefined) {
  if (milliseconds === undefined) return "Not recorded";
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "Invalid duration";
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`;

  const seconds = milliseconds / 1_000;
  if (seconds < 60) {
    return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} s`;
  }

  const roundedSeconds = Math.round(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

export function runLatencyBreakdown(steps: TimedStep[]) {
  let humanWaitMs = 0;
  let transportCallMs = 0;
  let recordedProcessingMs = 0;

  for (const step of steps) {
    if (step.latencyMs === undefined) continue;
    if (HUMAN_WAIT_STEPS.has(step.name)) {
      humanWaitMs += step.latencyMs;
    } else {
      recordedProcessingMs += step.latencyMs;
    }
    if (TRANSPORT_STEPS.has(step.name)) {
      transportCallMs += step.latencyMs;
    }
  }

  return {
    humanWaitMs: humanWaitMs || undefined,
    recordedProcessingMs: recordedProcessingMs || undefined,
    transportCallMs: transportCallMs || undefined,
  };
}
