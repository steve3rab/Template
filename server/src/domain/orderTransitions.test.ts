import { describe, expect, it } from 'vitest';
import { canTransitionOrderStatus } from './orderTransitions.js';

describe('order status transitions', () => {
  it.each([
    ['PENDING', 'PROCESSING'],
    ['PENDING', 'CANCELLED'],
    ['PROCESSING', 'SHIPPED'],
    ['PROCESSING', 'CANCELLED'],
    ['SHIPPED', 'DELIVERED'],
  ])('allows %s -> %s', (current, next) => {
    expect(canTransitionOrderStatus(current, next)).toBe(true);
  });

  it.each([
    ['PENDING', 'SHIPPED'],
    ['PROCESSING', 'DELIVERED'],
    ['SHIPPED', 'CANCELLED'],
    ['DELIVERED', 'CANCELLED'],
    ['CANCELLED', 'PROCESSING'],
    ['UNKNOWN', 'PENDING'],
    ['PENDING', 'UNKNOWN'],
  ])('rejects %s -> %s', (current, next) => {
    expect(canTransitionOrderStatus(current, next)).toBe(false);
  });
});
