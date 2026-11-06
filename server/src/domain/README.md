# Backend domain layer

Keep reusable business rules and transaction orchestration in this directory, outside HTTP route handlers.

- `orderTransitions.ts` is the single source of truth for valid order fulfillment status transitions. Its policy stays deterministic and side-effect free.
- `customerOrders.ts` owns the transactional creation of customer orders: server-side prices, seller grouping, stock reservation, order snapshots, and cart clearing.
- Route handlers remain responsible for authentication, authorization, input validation, payment-state prerequisites, and HTTP response mapping.
- Domain services must not trust client-supplied totals, ownership identifiers, or inventory values. Read authoritative values from the database and keep related writes in one transaction.
- Give domain failures explicit error codes so routes can map them to stable HTTP responses without parsing error-message text.

When adding a new order status, update the transition policy and its tests before exposing the status through an API or UI. Do not weaken payment/refund checks in route handlers when changing the lifecycle.
