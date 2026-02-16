# ADR-0003 No Runtime Dependencies

## Title

The package MUST contain zero runtime dependencies.

## Decision

The package.json file MUST omit dependencies.
The package.json file MUST omit optionalDependencies.
The package.json file MUST omit peerDependencies.

## Rationale

The dependency policy MUST reduce supply chain risk and runtime bloat.

## Consequences

All runtime behavior MUST be implemented in first-party code.

## Invariants

This ADR MUST activate INV-QUAL-0002.
This ADR MUST activate INV-QUAL-0003.
This ADR MUST activate INV-QUAL-0004.

## Gates

The scripts/check gate MUST verify the dependency policy in package.json.

## Operational Rubric R

Reliability impact MUST equal High.
Resilience impact MUST equal High.
Reversibility impact MUST equal High.
Resource impact MUST equal Medium.
Risk impact MUST equal Low.

## Structured Disagreement

Proposer position MUST favor zero runtime dependencies for deterministic execution.
Challenger position MUST question implementation effort for internal replacements.
Disagreement points MUST include maintenance burden and release velocity impact.
Resolution criteria MUST include gate pass status and performance regression review.

## Learning And Validation Loops

Premortem linkage MUST reference dependency reintroduction risk scenarios.
Blameless postmortem linkage MUST reference incident records for dependency policy breaches.
Double-loop learning outputs MUST update dependency governance when policy drift occurs.
PDCA updates MUST define recurring dependency audit checkpoints.
OODA updates MUST define remediation steps for detected dependency policy violations.

## Metrics And Evidence Controls

Primary metric MUST equal runtime dependency count.
Counter-metric MUST equal implementation maintenance effort findings.
Control group MUST equal modules with unchanged dependency posture.
Holdout group MUST equal benchmark runs excluded from dependency policy tuning.
Goodhart safeguards MUST require manual review of dependency declarations.
Hyrum compatibility risk status MUST equal Low.
Frame semantics impact status MUST equal Stable.
Deterministic acceptance checks MUST use scripts/check output artifacts.

## Research Lenses

This ADR MUST cite RL-LOG-0001.
This ADR MUST cite RL-CON-0002.

## Lens To Invariant Mapping

RL-LOG-0001 MUST map to INV-QUAL-0002 and INV-QUAL-0003 and INV-QUAL-0004.
RL-CON-0002 MUST map to INV-QUAL-0002 and INV-QUAL-0003 and INV-QUAL-0004.

## Evidence Mapping

INV-QUAL-0002 MUST map to artifacts/gates/INV-QUAL-0002.json.
INV-QUAL-0003 MUST map to artifacts/gates/INV-QUAL-0003.json.
INV-QUAL-0004 MUST map to artifacts/gates/INV-QUAL-0004.json.

## Traceability Record

```json
{
  "lenses": ["RL-LOG-0001", "RL-CON-0002"],
  "invariants": ["INV-QUAL-0002", "INV-QUAL-0003", "INV-QUAL-0004"],
  "mappings": [
    { "lens_id": "RL-LOG-0001", "invariant_ids": ["INV-QUAL-0002", "INV-QUAL-0003", "INV-QUAL-0004"] },
    { "lens_id": "RL-CON-0002", "invariant_ids": ["INV-QUAL-0002", "INV-QUAL-0003", "INV-QUAL-0004"] }
  ],
  "evidence": [
    { "invariant_id": "INV-QUAL-0002", "artifact": "artifacts/gates/INV-QUAL-0002.json" },
    { "invariant_id": "INV-QUAL-0003", "artifact": "artifacts/gates/INV-QUAL-0003.json" },
    { "invariant_id": "INV-QUAL-0004", "artifact": "artifacts/gates/INV-QUAL-0004.json" }
  ]
}
```
