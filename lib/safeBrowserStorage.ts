export type BrowserStorageLike = Pick<Storage, "getItem" | "setItem">;

export type BrowserStorageRead = {
  available: boolean;
  value: string | null;
};

export function readBrowserStorageValue(
  key: string,
  storage?: BrowserStorageLike,
): BrowserStorageRead {
  const availableStorage = resolveBrowserStorage(storage);
  if (!availableStorage) return { available: false, value: null };

  try {
    return { available: true, value: availableStorage.getItem(key) };
  } catch {
    return { available: false, value: null };
  }
}

export function writeBrowserStorageValue(
  key: string,
  value: string,
  storage?: BrowserStorageLike,
) {
  const availableStorage = resolveBrowserStorage(storage);
  if (!availableStorage) return false;

  try {
    availableStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function getOrCreateBrowserStorageValue(
  key: string,
  prefix: string,
  storage?: BrowserStorageLike,
) {
  const stored = readBrowserStorageValue(key, storage);
  if (!stored.available) return undefined;
  if (stored.value) return stored.value;

  let value: string;
  try {
    value = `${prefix}_${crypto.randomUUID()}_${crypto.randomUUID()}`;
  } catch {
    return undefined;
  }

  return writeBrowserStorageValue(key, value, storage) ? value : undefined;
}

function resolveBrowserStorage(storage?: BrowserStorageLike) {
  if (storage) return storage;
  if (typeof window === "undefined") return undefined;

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
