/**
 * Formats API timestamps at the presentation boundary.
 * Invalid, missing, or out-of-range values never leak "Invalid Date" into the UI.
 */
export function formatDate(
  value: Date | string | number | null | undefined,
  locale = 'fr-FR',
  options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
  fallback = '—',
): string {
  if (value === null || value === undefined || value === '') return fallback;

  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return fallback;

  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return fallback;
  }
}

/** Formats a timestamp with both date and time using the selected locale. */
export function formatDateTime(
  value: Date | string | number | null | undefined,
  locale = 'fr-FR',
  fallback = '—',
): string {
  return formatDate(value, locale, { dateStyle: 'medium', timeStyle: 'short' }, fallback);
}
