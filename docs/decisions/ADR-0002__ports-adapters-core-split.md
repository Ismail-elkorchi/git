# ADR-0002 Core Ports Adapters Split

## Title

The codebase structure MUST separate Core and Ports and Adapters.

## Decision

Core implementation MUST exist under src/core.
Port interfaces MUST exist under src/ports.
Adapter implementations MUST exist under src/adapters.

## Rationale

The split MUST permit multi-runtime support without runtime-specific logic in Core.

## Consequences

Core modules MUST NOT import Adapter modules.

## Invariants

This ADR MUST activate INV-ARCH-0001.
This ADR MUST activate INV-ARCH-0002.

## Gates

The scripts/check gate MUST scan imports to enforce Core purity.

## Operational Rubric R

Reliability impact MUST equal High.
Resilience impact MUST equal High.
Reversibility impact MUST equal Medium.
Resource impact MUST equal Medium.
Risk impact MUST equal Medium.

## Structured Disagreement

Proposer position MUST favor strict boundary isolation for runtime portability.
Challenger position MUST question complexity overhead in adapter orchestration.
Disagreement points MUST include boundary granularity and code navigation cost.
Resolution criteria MUST include import purity gate pass and API clarity review.

## Learning And Validation Loops

Premortem linkage MUST reference boundary-violation failure scenarios.
Blameless postmortem linkage MUST reference architecture incident records for runtime leaks.
Double-loop learning outputs MUST update architecture rules when boundary incidents recur.
PDCA updates MUST define refactor checkpoints for import boundary drift.
OODA updates MUST define rapid rollback paths for boundary regression incidents.

## Metrics And Evidence Controls

Primary metric MUST equal Core boundary gate pass rate.
Counter-metric MUST equal adapter integration complexity findings.
Control group MUST equal modules with unchanged boundary layout.
Holdout group MUST equal runtime integration tests excluded from boundary tuning.
Goodhart safeguards MUST require design review in addition to pass-rate metrics.
Hyrum compatibility risk status MUST equal Medium.
Frame semantics impact status MUST equal Stable.
Deterministic acceptance checks MUST use scripts/check output artifacts.

## Research Lenses

This ADR MUST cite RL-LOG-0003.
This ADR MUST cite RL-LOG-0004.
This ADR MUST cite RL-CON-0002.

## Lens To Invariant Mapping

RL-LOG-0003 MUST map to INV-ARCH-0001.
RL-LOG-0004 MUST map to INV-ARCH-0002.
RL-CON-0002 MUST map to INV-ARCH-0001 and INV-ARCH-0002.

## Evidence Mapping

INV-ARCH-0001 MUST map to artifacts/gates/INV-ARCH-0001.json.
INV-ARCH-0002 MUST map to artifacts/gates/INV-ARCH-0002.json.

## Traceability Record

```json
{
  "lenses": ["RL-LOG-0003", "RL-LOG-0004", "RL-CON-0002"],
  "invariants": ["INV-ARCH-0001", "INV-ARCH-0002"],
  "mappings": [
    { "lens_id": "RL-LOG-0003", "invariant_ids": ["INV-ARCH-0001"] },
    { "lens_id": "RL-LOG-0004", "invariant_ids": ["INV-ARCH-0002"] },
    { "lens_id": "RL-CON-0002", "invariant_ids": ["INV-ARCH-0001", "INV-ARCH-0002"] }
  ],
  "evidence": [
    { "invariant_id": "INV-ARCH-0001", "artifact": "artifacts/gates/INV-ARCH-0001.json" },
    { "invariant_id": "INV-ARCH-0002", "artifact": "artifacts/gates/INV-ARCH-0002.json" }
  ]
}
```
