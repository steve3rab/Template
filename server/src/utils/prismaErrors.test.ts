import { describe, expect, it } from 'vitest';
import {
  hasPrismaErrorCode,
  isPrismaRecordNotFoundError,
  isPrismaUniqueConstraintError,
} from './prismaErrors.js';

describe('Prisma error guards', () => {
  it('recognizes known Prisma error codes on untrusted values', () => {
    expect(isPrismaUniqueConstraintError({ code: 'P2002' })).toBe(true);
    expect(isPrismaRecordNotFoundError({ code: 'P2025' })).toBe(true);
    expect(hasPrismaErrorCode({ code: 'P2003' }, 'P2003')).toBe(true);
  });

  it('rejects unrelated and malformed thrown values', () => {
    for (const value of [null, undefined, 'P2002', new Error('failed'), {}, { code: 42 }]) {
      expect(isPrismaUniqueConstraintError(value)).toBe(false);
      expect(isPrismaRecordNotFoundError(value)).toBe(false);
    }
  });

  it('narrows only when the requested code matches exactly', () => {
    const value: unknown = { code: 'P2002' };
    if (hasPrismaErrorCode(value, 'P2002')) {
      expect(value.code).toBe('P2002');
    } else {
      throw new Error('Expected the Prisma error code to match.');
    }
  });
});
