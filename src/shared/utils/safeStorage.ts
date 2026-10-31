/**
 * Reads JSON from browser storage without allowing malformed or unavailable storage
 * to crash application startup. The caller supplies the expected fallback value.
 */
export function readStoredJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** Writes JSON to browser storage; quota and privacy-mode failures are non-fatal. */
export function writeStoredJson<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is a convenience for guest sessions, not the source of truth.
  }
}
