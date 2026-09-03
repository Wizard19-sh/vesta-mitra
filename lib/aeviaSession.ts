"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getOrCreateBrowserStorageValue,
  readBrowserStorageValue,
  type BrowserStorageLike,
} from "./safeBrowserStorage";

const OWNER_KEY = "aevia-device-credential";
const ANONYMOUS_ID = "aevia-analytics-id";
const LEGACY_MITRA_OWNER_KEY = "mitra-owner-key";

export type DeviceCredentialState =
  | { status: "loading" }
  | { status: "ready"; credential: string }
  | { status: "unavailable" };

export function getOrCreateDeviceCredential(storage?: BrowserStorageLike) {
  return getOrCreateBrowserStorageValue(OWNER_KEY, "aevia_device", storage);
}

export function getOrCreateAnonymousId(storage?: BrowserStorageLike) {
  return getOrCreateBrowserStorageValue(ANONYMOUS_ID, "aevia_anon", storage);
}

export function readDeviceCredential(storage?: BrowserStorageLike) {
  const result = readBrowserStorageValue(OWNER_KEY, storage);
  return result.available ? result.value ?? undefined : undefined;
}

export function getOrCreateLegacyMitraCredential(storage?: BrowserStorageLike) {
  return getOrCreateBrowserStorageValue(
    LEGACY_MITRA_OWNER_KEY,
    "mitra",
    storage,
  );
}

export function getDeviceCredentialState(
  storage?: BrowserStorageLike,
): DeviceCredentialState {
  const credential = getOrCreateDeviceCredential(storage);
  return credential
    ? { status: "ready", credential }
    : { status: "unavailable" };
}

export function useDeviceCredential() {
  const [state, setState] = useState<DeviceCredentialState>({
    status: "loading",
  });
  const refresh = useCallback(() => {
    setState(getDeviceCredentialState());
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(refresh, 0);
    return () => window.clearTimeout(timeoutId);
  }, [refresh]);

  return [state, refresh] as const;
}
