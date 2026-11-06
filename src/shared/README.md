# Shared code

This directory contains **domain-agnostic** building blocks used by multiple features.

- `i18n.ts`: language and translation primitives.
- `utils/formatCurrency.ts`: shared money formatting at UI boundaries. API/database amounts stay in integer cents.
- `utils/safeStorage.ts`: guarded JSON storage for non-critical guest-session convenience data.
- `components/`: accessible UI primitives when a component is reused.

Keep feature-specific business rules inside their owning feature. Do not use this directory as a catch-all, and avoid abstractions for one-off logic. Utility functions should have focused tests and should not import feature modules.

- `utils/formatDate.ts`: locale-aware date/date-time formatting with safe fallbacks for invalid API values.
- `components/Button.tsx`: shared semantic button with consistent variants, sizes, keyboard focus, and duplicate-submit protection while loading.

## Reuse rules

- Prefer shared primitives over repeating low-level markup and behavior.
- Keep components accessible by default: semantic elements, visible focus, disabled states, and accessible loading feedback.
- Keep formatting at the UI boundary; persist timestamps as ISO values and money as integer minor units.
- Add focused unit tests whenever a shared utility or component is introduced.
- Do not add feature-specific business rules here. Promote code only after at least two real consumers need the same behavior.

- `components/TextField.tsx`: labelled input with generated IDs, hint/error associations, and native input attributes.
- `components/StatusMessage.tsx`: consistent information, success, warning, and error feedback with appropriate live-region urgency.

Form controls should use native input semantics and keep validation text programmatically associated with the control. Use urgent live regions only for warnings/errors; routine status should remain polite.
