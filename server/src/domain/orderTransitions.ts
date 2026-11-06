export const ORDER_STATUS_TRANSITIONS = {
  PENDING: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
} as const;

export type OrderStatus = keyof typeof ORDER_STATUS_TRANSITIONS;

/** Returns whether a state change is part of the supported fulfillment lifecycle. */
export function canTransitionOrderStatus(current: string, next: string): boolean {
  return (
    Object.hasOwn(ORDER_STATUS_TRANSITIONS, current) &&
    (ORDER_STATUS_TRANSITIONS[current as OrderStatus] as readonly string[]).includes(next)
  );
}
