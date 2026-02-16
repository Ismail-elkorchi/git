# Runbook

## Merge Controls

The repository MUST use GitHub pull requests for changes.
The repository MUST use the workflow jobs defined in .github/workflows/ci.yml.
The repository MUST require green CI before merge.
The Executor MUST merge each phase pull request after required checks pass.
The Executor MUST continue phase execution until PR-0018 merge completes.
The repository MUST publish only from main.

## Premortem Controls

Every high-risk pull request MUST include a premortem checklist in the pull request body.
Every premortem checklist MUST list one failure mode for correctness drift.
Every premortem checklist MUST list one failure mode for security drift.
Every premortem checklist MUST list one failure mode for performance drift.
Every premortem checklist MUST list one mitigation action per failure mode.

## Stochastic Tooling Controls

Every acceptance decision MUST rely on deterministic gate results.
Every stochastic model output MUST be treated as an untrusted intermediate artifact.
Every claim accepted from stochastic tooling MUST map to one Evidence Artifact file.

## Metrics Controls

Every optimization claim MUST define a control group.
Every optimization claim MUST define a holdout group.
Every optimization claim MUST define a Goodhart guardrail metric.
Every optimization claim MUST define one qualitative review checkpoint.

## Incident Learning Controls

Every incident record MUST include timeline and impact and contributing factors.
Every incident record MUST include corrective actions and owners and due dates.
Every incident record MUST include a double-loop learning update.
Every incident record MUST include PDCA updates for the next release cycle.
Every incident record MUST include OODA updates for response playbooks.
