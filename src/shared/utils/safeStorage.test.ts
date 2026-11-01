import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readStoredJson, writeStoredJson } from './safeStorage';

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');
const isCart = (value: unknown): value is Record<string, number> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((quantity) => Number.isInteger(quantity) && quantity >= 0);

describe('safe browser storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('reads valid JSON and returns the fallback for missing values', () => {
    window.localStorage.setItem('cart', '{"sku":2}');
    expect(readStoredJson('cart', {}, isCart)).toEqual({ sku: 2 });
    expect(readStoredJson('missing', {}, isCart)).toEqual({});
  });

  it('returns the fallback when stored JSON is malformed', () => {
    window.localStorage.setItem('cart', '{invalid');
    expect(readStoredJson('cart', { sku: 1 }, isCart)).toEqual({ sku: 1 });
  });

  it('does not throw when storage is unavailable for reads or writes', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });

    expect(readStoredJson('cart', [], isStringArray)).toEqual([]);
    expect(() => writeStoredJson('cart', ['sku'])).not.toThrow();
  });

  it('writes JSON values', () => {
    writeStoredJson('cart', { sku: 3 });
    expect(window.localStorage.getItem('cart')).toBe('{"sku":3}');
  });
});
