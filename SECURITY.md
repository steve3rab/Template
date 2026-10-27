# Security policy

## Reporting a vulnerability

Do not publish exploitable details in a public issue. Contact the repository owner privately through
GitHub to coordinate triage and remediation.

## Engineering baseline

- Never commit secrets, tokens, private keys, or production data.
- Treat browser storage and all client-provided data as untrusted.
- Validate data received from APIs at runtime before using it in domain logic.
- Enforce authorization and input validation on the server; frontend checks are not security controls.
- Review dependency and GitHub Actions updates before merging.
- Keep CI permissions minimal and protect the default branch with required checks and review.
