import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readStoredJson, writeStoredJson } from './safeStorage';

describe('safe browser storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('reads valid JSON and returns the fallback for missing values', () => {
    window.localStorage.setItem('cart', '{"sku":2}');
    expect(readStoredJson('cart', {})).toEqual({ sku: 2 });
    expect(readStoredJson('missing', {})).toEqual({});
  });

  it('returns the fallback when stored JSON is malformed', () => {
    window.localStorage.setItem('cart', '{invalid');
    expect(readStoredJson('cart', { sku: 1 })).toEqual({ sku: 1 });
  });

  it('does not throw when storage is unavailable for reads or writes', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });

    expect(readStoredJson('cart', [])).toEqual([]);
    expect(() => writeStoredJson('cart', ['sku'])).not.toThrow();
  });

  it('writes JSON values', () => {
    writeStoredJson('cart', { sku: 3 });
    expect(window.localStorage.getItem('cart')).toBe('{"sku":3}');
  });
});
