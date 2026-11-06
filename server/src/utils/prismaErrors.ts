/** Narrow Prisma's known-request errors without trusting arbitrary thrown values. */
export function hasPrismaErrorCode(error: unknown, code: string): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code === code
  );
}

/** Prisma P2002: a unique constraint would be violated. */
export function isPrismaUniqueConstraintError(error: unknown): boolean {
  return hasPrismaErrorCode(error, 'P2002');
}

/** Prisma P2025: the requested record does not exist for this operation. */
export function isPrismaRecordNotFoundError(error: unknown): boolean {
  return hasPrismaErrorCode(error, 'P2025');
}
