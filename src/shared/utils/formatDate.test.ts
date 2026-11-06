import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime } from './formatDate';

describe('date formatting', () => {
  it('formats supported date input types consistently', () => {
    const timestamp = Date.UTC(2025, 0, 15);
    expect(formatDate(new Date(timestamp), 'en-GB')).toBe('15 Jan 2025');
    expect(formatDate(timestamp, 'en-GB')).toBe('15 Jan 2025');
    expect(formatDate('2025-01-15T00:00:00.000Z', 'en-GB')).toBe('15 Jan 2025');
  });

  it('returns the fallback for absent and invalid values', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
    expect(formatDate(Number.NaN, 'fr-FR', undefined, 'Date inconnue')).toBe('Date inconnue');
  });

  it('supports date-time formatting and custom options', () => {
    expect(formatDateTime('2025-01-15T12:30:00.000Z', 'en-GB')).toContain('15 Jan 2025');
    expect(formatDate('2025-01-15T00:00:00.000Z', 'en-US', { year: 'numeric' })).toBe('2025');
  });
});
