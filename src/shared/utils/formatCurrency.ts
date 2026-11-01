const currencyFormatters = new Map<string, Intl.NumberFormat>();

/**
 * Formats a monetary amount expressed in major currency units (for example, 12.5 EUR).
 * Use formatCents for integer values stored in cents by the API.
 */
export function formatCurrency(amount: number, currency = 'EUR', locale = 'fr-FR'): string {
  if (!Number.isFinite(amount)) {
    return '—';
  }

  const key = `${locale}:${currency}`;
  let formatter = currencyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    });
    currencyFormatters.set(key, formatter);
  }

  return formatter.format(amount);
}

/** Formats an integer monetary amount stored in the smallest currency unit. */
export function formatCents(amountInCents: number, currency = 'EUR', locale = 'fr-FR'): string {
  return formatCurrency(amountInCents / 100, currency, locale);
}
