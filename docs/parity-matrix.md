# Parity Matrix

## Baseline

The parity matrix MUST track command-family parity against official Git 2.53.0.
The parity matrix MUST map each command family to one of implemented or partial or not-implemented states.
The parity matrix MUST define test evidence expectations for each command family.

## Core Repository Data

| Command Family | State | Evidence Expectation |
| --- | --- | --- |
| `hash-object`, `cat-file` | implemented | MUST pass deterministic object fixture tests across runtimes. |
| `write-tree`, `commit-tree` | implemented | MUST produce object bytes identical to fixture expectations. |
| `pack-objects`, `index-pack`, `verify-pack` | implemented | MUST pass pack round-trip tests and `git verify-pack -v` checks. |
| `fsck` | implemented | MUST pass `git fsck --full` on produced repositories. |
| `gc`, `repack`, `prune`, `maintenance` | implemented | MUST pass maintenance integration tests without repository corruption. |

## Working Tree and History

| Command Family | State | Evidence Expectation |
| --- | --- | --- |
| `add`, `checkout`, `status`, `diff`, `apply`, `blame` | implemented | MUST pass CLI parity fixture tests for index and worktree transitions. |
| `merge`, `rebase`, `cherry-pick`, `revert`, `stash` | implemented | MUST pass graph-shape and conflict-behavior parity tests. |
| `branch`, `tag`, `remote`, `log`, revision walk | implemented | MUST pass ref mutation and history traversal parity tests. |
| `submodule`, `worktree` | implemented | MUST pass metadata and filesystem mutation parity tests. |
| `sparse-checkout`, partial clone | implemented | MUST pass path filter and lazy object fetch parity tests. |

## Transport and Protocol

| Command Family | State | Evidence Expectation |
| --- | --- | --- |
| Smart HTTP v2 fetch and push | implemented | MUST pass protocol transcript parity fixtures. |
| SSH transport | implemented | MUST pass authentication and capability-negotiation integration tests. |
| Credential helper and config layering | implemented | MUST pass deterministic precedence tests across runtime adapters. |

## Newer Git Command Families

| Command Family | State | Evidence Expectation |
| --- | --- | --- |
| `refs` | implemented | MUST pass create and list and delete and verify parity tests against git refs behavior. |
| `repo` | implemented | MUST pass repo info and repo structure keyvalue parity tests against git repo command outputs. |
| `backfill` | not-implemented | MUST define protocol and object model behavior before marking implemented. |
| `replay` | implemented | MUST pass ordered replay and conflict-stop parity tests against sequential git apply behavior. |
| `last-modified` | implemented | MUST pass history and index parity tests against git log and git ls-files outputs. |

## Governance

When any command family state changes, this file MUST be updated in the same pull request.
Every implemented command family MUST have one or more CI gates that can falsify parity claims.
Rows in this file MUST match spec/parity-roadmap.yaml and scripts/parity_matrix_check.
