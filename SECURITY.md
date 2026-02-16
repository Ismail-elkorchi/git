# Security Policy

## Supported Versions

The repository MUST support the runtime targets defined in docs/runtime-targets.md.

## Reporting

Security reports MUST be sent via a private channel controlled by the maintainer.
Security reports MUST include reproduction steps and affected versions.
The maintainer MUST acknowledge security reports within 7 days.

## Secure Development Rules

The codebase MUST follow docs/security.md.
The codebase MUST pass node scripts/banned_token_scan in CI.
The codebase MUST pass node scripts/pr_policy_check in CI.
