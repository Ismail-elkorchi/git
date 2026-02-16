# ADR-0001 License MIT

## Title

The project license MUST be MIT.

## Decision

The repository MUST include an MIT LICENSE file.
The package metadata MUST declare MIT as the license.

## Rationale

The license choice MUST permit commercial use and modification and distribution.

## Consequences

All contributions MUST be compatible with the MIT license.

## Invariants

This ADR MUST activate INV-QUAL-0001.

## Gates

The scripts/check gate MUST verify the LICENSE file presence and content.

## Operational Rubric R

Reliability impact MUST equal High.
Resilience impact MUST equal High.
Reversibility impact MUST equal High.
Resource impact MUST equal Low.
Risk impact MUST equal Low.

## Structured Disagreement

Proposer position MUST favor permissive licensing for ecosystem adoption.
Challenger position MUST question license compatibility risk for contributions.
Disagreement points MUST include legal compatibility and contribution policy scope.
Resolution criteria MUST include legal review acceptance and policy clarity.

## Learning And Validation Loops

Premortem linkage MUST reference licensing risk review before dependency intake.
Blameless postmortem linkage MUST reference release incident records when license issues occur.
Double-loop learning outputs MUST update contribution policy when license assumptions fail.
PDCA updates MUST define a license compliance review step per release cycle.
OODA updates MUST define response steps for license violation reports.

## Metrics And Evidence Controls

Primary metric MUST equal license file conformance pass rate.
Counter-metric MUST equal legal exception count per release.
Control group MUST equal repositories with unchanged license policy.
Holdout group MUST equal releases excluded from policy tuning.
Goodhart safeguards MUST require legal review in addition to metric thresholds.
Hyrum compatibility risk status MUST equal Low.
Frame semantics impact status MUST equal Stable.
Deterministic acceptance checks MUST use scripts/check output artifacts.

## Research Lenses

This ADR MUST cite RL-LOG-0001.
This ADR MUST cite RL-CON-0002.

## Lens To Invariant Mapping

RL-LOG-0001 MUST map to INV-QUAL-0001.
RL-CON-0002 MUST map to INV-QUAL-0001.

## Evidence Mapping

INV-QUAL-0001 MUST map to artifacts/gates/INV-QUAL-0001.json.

## Traceability Record

```json
{
  "lenses": ["RL-LOG-0001", "RL-CON-0002"],
  "invariants": ["INV-QUAL-0001"],
  "mappings": [
    { "lens_id": "RL-LOG-0001", "invariant_ids": ["INV-QUAL-0001"] },
    { "lens_id": "RL-CON-0002", "invariant_ids": ["INV-QUAL-0001"] }
  ],
  "evidence": [
    { "invariant_id": "INV-QUAL-0001", "artifact": "artifacts/gates/INV-QUAL-0001.json" }
  ]
}
```
