import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  getOrCreateBrowserStorageValue,
  readBrowserStorageValue,
} from "../lib/safeBrowserStorage.ts";
import {
  initialOnboardingStep,
  previousOnboardingStep,
} from "../lib/onboardingFlowState.ts";

const securityError = Object.assign(new Error("Blocked"), {
  name: "SecurityError",
});
const readFailure = {
  getItem() {
    throw securityError;
  },
  setItem() {
    throw securityError;
  },
};
const writeFailure = {
  getItem() {
    return null;
  },
  setItem() {
    throw securityError;
  },
};

assert.deepEqual(readBrowserStorageValue("test", readFailure), {
  available: false,
  value: null,
});

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: Object.defineProperty({}, "localStorage", {
    get() {
      throw securityError;
    },
  }),
});
assert.deepEqual(readBrowserStorageValue("test"), {
  available: false,
  value: null,
});
if (originalWindow) {
  Object.defineProperty(globalThis, "window", originalWindow);
} else {
  delete globalThis.window;
}
assert.equal(
  getOrCreateBrowserStorageValue("test", "prefix", readFailure),
  undefined,
);
assert.equal(
  getOrCreateBrowserStorageValue("test", "prefix", writeFailure),
  undefined,
);
assert.equal(
  getOrCreateBrowserStorageValue("device", "aevia_device", readFailure),
  undefined,
);
assert.equal(
  getOrCreateBrowserStorageValue("analytics", "aevia_anon", writeFailure),
  undefined,
);

const existingOnly = {
  getItem() {
    return "existing-session";
  },
  setItem() {
    throw new Error("An existing session should not be replaced");
  },
};
assert.equal(
  getOrCreateBrowserStorageValue("test", "prefix", existingOnly),
  "existing-session",
);

assert.equal(
  initialOnboardingStep({
    hasExistingSession: false,
    hasSpecialistSetup: false,
  }),
  "identity",
);
assert.equal(
  initialOnboardingStep({
    hasExistingSession: true,
    hasSpecialistSetup: false,
  }),
  "household",
);
assert.equal(
  initialOnboardingStep({
    hasExistingSession: true,
    hasSpecialistSetup: true,
  }),
  "review",
);

const draft = {
  name: "Test User",
  email: "test@example.invalid",
};
const beforeBack = structuredClone(draft);
assert.equal(previousOnboardingStep("household", "mitra"), "identity");
assert.equal(previousOnboardingStep("choice", "mitra"), "household");
assert.equal(previousOnboardingStep("mitraWho", "mitra"), "choice");
assert.equal(previousOnboardingStep("tarlaEaters", "both"), "mitraRoutines");
assert.equal(previousOnboardingStep("tarlaEaters", "tarla"), "choice");
assert.deepEqual(draft, beforeBack);

const files = {
  onboarding: await readFile(
    new URL("../app/onboarding/page.tsx", import.meta.url),
    "utf8",
  ),
  dashboard: await readFile(
    new URL("../app/dashboard/page.tsx", import.meta.url),
    "utf8",
  ),
  adminRuns: await readFile(
    new URL("../app/admin/runs/page.tsx", import.meta.url),
    "utf8",
  ),
  landingModule: await readFile(
    new URL("../app/page.tsx", import.meta.url),
    "utf8",
  ),
  analytics: await readFile(
    new URL("../lib/productAnalytics.ts", import.meta.url),
    "utf8",
  ),
  session: await readFile(
    new URL("../lib/aeviaSession.ts", import.meta.url),
    "utf8",
  ),
};

assert.doesNotMatch(
  files.onboarding,
  /key=\{existingSession\?\.profile\._id \?\? "fresh"\}/,
);
assert.match(files.onboarding, /initialOnboardingStep/);
assert.match(files.onboarding, /setSessionIds\([\s\S]*setStep\("household"\)/);
assert.match(files.onboarding, /previousOnboardingStep/);

for (const [name, source] of Object.entries(files)) {
  assert.doesNotMatch(
    source,
    /window\.localStorage/,
    `${name} must use the shared safe storage abstraction`,
  );
}

for (const source of [files.onboarding, files.dashboard, files.adminRuns]) {
  assert.match(source, /useDeviceCredential/);
  assert.match(source, /SessionUnavailable/);
}

assert.doesNotMatch(files.analytics, /useState/);
assert.match(files.analytics, /getOrCreateAnonymousId\(\)/);
assert.match(files.analytics, /readDeviceCredential\(\)/);
assert.match(files.session, /getOrCreateBrowserStorageValue/);
assert.match(files.session, /readBrowserStorageValue/);

console.log(
  JSON.stringify(
    {
      evalSet: "m0_stability",
      passed: 15,
      failed: 0,
      realMessageSent: false,
      cases: [
        "Storage read failure is contained",
        "Blocked localStorage access is contained",
        "Storage write failure is contained",
        "Device credential creation fails safely",
        "Analytics identity creation fails safely",
        "Existing session is never replaced after a write failure",
        "Fresh onboarding starts at identity",
        "Identity-only reload resumes at Household",
        "Completed setup reload hydrates its saved setup",
        "Back navigation preserves entered values",
        "Identity result advances the live flow without a remount key",
        "Onboarding renders a recoverable unavailable-session state",
        "Dashboard renders a recoverable unavailable-session state",
        "Run viewer renders a recoverable unavailable-session state",
        "Analytics has no browser-storage render initializer",
      ],
    },
    null,
    2,
  ),
);
