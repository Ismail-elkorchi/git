# Gates

The repository MUST use scripts/check as the single entrypoint for verification.
The scripts/check command MUST create Evidence Artifacts under artifacts/gates.
Every activated Invariant MUST have an Evidence Artifact under artifacts/gates.
The repository MUST run scripts/banned_token_scan in CI.
The repository MUST run scripts/pr_policy_check in CI.
The repository MUST run lint and typecheck and tests in CI.
