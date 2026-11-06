# Backend domain policies

Keep domain rules that must remain consistent across HTTP routes in this directory.

- `orderTransitions.ts` is the single source of truth for valid order fulfillment status transitions.
- Route handlers remain responsible for authorization, payment-state prerequisites, persistence, and HTTP responses.
- Domain policies must be deterministic, side-effect free, and covered by focused unit tests.

When adding a new order status, update the transition policy and its tests before exposing the status through an API or UI. Do not weaken payment/refund checks in route handlers when changing the lifecycle.
