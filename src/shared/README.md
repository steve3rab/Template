# Shared code

This directory contains **domain-agnostic** building blocks used by multiple features.

- `i18n.ts`: language and translation primitives.
- `utils/formatCurrency.ts`: shared money formatting at UI boundaries. API/database amounts stay in integer cents.
- `utils/safeStorage.ts`: guarded JSON storage for non-critical guest-session convenience data.
- `components/`: accessible UI primitives when a component is reused.

Keep feature-specific business rules inside their owning feature. Do not use this directory as a catch-all, and avoid abstractions for one-off logic. Utility functions should have focused tests and should not import feature modules.
