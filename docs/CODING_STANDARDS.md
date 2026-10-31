# Coding standards

These rules apply to the React/TypeScript frontend and the Fastify/Prisma API.

## Design principles

- Prefer small modules with one clear responsibility. Keep UI components focused on presentation and interaction; move reusable logic to `src/shared` or feature-specific modules.
- Keep HTTP route registration thin. Put input schemas in a dedicated schema module, business rules in services, and database queries behind repositories when that reduces coupling or enables isolated tests.
- Do not introduce abstractions for one-off code. Extract a utility when logic is reused, has non-trivial edge cases, or deserves independent tests.
- Keep dependencies flowing inward: features may use shared utilities; shared utilities must not import feature modules. Server modules must not import frontend code.
- Keep API contracts explicit. Validate all untrusted input at the boundary with Zod; do not trust TypeScript casts on parsed JSON as runtime validation.
- Keep money in integer minor units (for EUR, cents) in API and database models. Convert only at presentation boundaries with the shared currency utilities.
- Use named exports for application modules. Avoid default exports except where a framework or configuration requires them.

## TypeScript

- Strict TypeScript is mandatory. Preserve `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, and unused-symbol checks.
- Never use `any`, non-null assertions, or broad type casts to silence compiler errors. Prefer `unknown`, narrowing, Zod inference, and explicit domain types.
- Use `import type` for type-only imports.
- Give public function inputs and outputs explicit types when they form a reusable contract.
- Model finite states and roles with unions/enums instead of unconstrained strings.
- Use `unknown` for caught errors and narrow with `instanceof Error` before reading messages.

## React and browser code

- Keep components and hooks feature-oriented. Do not put API persistence, formatting, storage parsing, and unrelated UI state into one component.
- Use effects for synchronization with external systems, not for values that can be derived during render.
- Clean up subscriptions and async effects. Handle stale responses and user-visible failure states.
- Centralize repeated browser utilities (currency, dates, storage, HTTP) rather than reimplementing them.
- Never store secrets or session tokens in browser storage. The server owns authentication and authorization decisions.

## API and persistence

- Every route must validate path parameters, query parameters, and request bodies before using them.
- Authorization must be checked on the server for every protected operation and every resource owner boundary.
- Keep transactions around multi-step writes that must succeed or fail together.
- Use Prisma migrations for schema changes; never edit a deployed database schema manually.
- Return stable, intentional API payloads; do not expose password hashes, reset tokens, session hashes, or internal exception details.
- Use consistent HTTP status codes and structured logs. Do not log passwords, cookies, reset tokens, or sensitive address/payment details.

## Naming and formatting

- Use `PascalCase` for React components and types, `camelCase` for variables/functions, and `UPPER_SNAKE_CASE` for constants that are truly global constants.
- Name files after their primary export; use descriptive names rather than generic `helpers` or `common`.
- Follow Prettier settings and the two-space indentation in `.editorconfig`. Do not manually reformat unrelated files.
- Prefer early returns and avoid nested conditionals when they obscure the happy path.
- Comments should explain intent or constraints, not restate the code.

## Required checks before pushing

Run these commands locally and resolve failures before pushing:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run build
npm run build:server
```

For behavior changes, add or update focused unit/API tests. For database and cross-feature flows, add integration or end-to-end coverage. CI is the final verification gate; never describe a check as passing unless its result is visible.

## Pull request / commit hygiene

- Make commits small and describe the intent in the commit message.
- Avoid combining refactors with unrelated behavior changes.
- Update documentation when a new convention or module boundary is introduced.
- Never commit credentials, local databases, generated build output, or dependency directories.
