/**
 * Reads JSON from browser storage and validates its shape. Storage is untrusted input:
 * the validator must narrow unknown to T before the value is returned.
 */
export function readStoredJson<T>(
  key: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : fallback;
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
