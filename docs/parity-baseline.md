# Parity Baseline

## Official Git Baseline

The parity baseline MUST track the latest stable official Git release line.
The baseline version MUST be Git 2.53.0.
The baseline source MUST be the official git-scm source release index.
The baseline command surface MUST include command families listed by git help -a.
The baseline command surface MUST include new documented commands from recent Git docs updates.
The baseline command-family status MUST be tracked in docs/parity-matrix.md.

## Latest Command Family Signals

The parity matrix MUST include git refs command family coverage.
The parity matrix MUST include git repo command family coverage.
The parity matrix MUST include git backfill command family coverage.
The parity matrix MUST include git replay command family coverage.
The parity matrix MUST include git last-modified command family coverage.

## Workflow Baseline

The CI workflow MUST pin third-party actions to immutable commit SHAs.
The dependency update workflow MUST minimize PR noise while preserving security updates.
The dependency update workflow MUST group security updates by ecosystem.
