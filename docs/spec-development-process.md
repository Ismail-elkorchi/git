# Development Process Specification

The repository MUST implement work as sequential pull requests defined in spec/phase-plan.yaml.
The repository MUST maintain critical claim mappings in spec/claims.yaml.
The repository MUST maintain formal logic lens mappings in spec/lens-mapping.yaml.
The repository MUST maintain parity baseline tracking in docs/parity-baseline.md.
The repository MUST maintain command-family parity status in docs/parity-matrix.md.
The repository MUST maintain machine-checkable parity status in spec/parity-roadmap.yaml.
Each pull request MUST update spec/state.yaml current_phase to the pull request phase number.
Pull request PR-0001 MUST establish repository scaffolding and CI and policy gates.
Pull request PR-0002 MUST establish public API contracts and ports and error taxonomy.
Pull request PR-0003 MUST implement SHA-1 and SHA-256 hashing with tests.
Pull request PR-0004 MUST implement compression and CRC32 and safety limits with tests.
Pull request PR-0005 MUST implement repository init and open and loose objects with tests.
Pull request PR-0006 MUST implement refs and packed-refs and reflog with tests.
Pull request PR-0007 MUST implement index and add and checkout and status with tests.
Pull request PR-0008 MUST implement pack and protocol and Smart HTTP fetch and push with tests.
Pull request PR-0009 MUST implement publishing readiness and release documentation and publish dry run gates.
Pull request PR-0010 MUST implement SSH transport and credentials and config and hooks.
Pull request PR-0011 MUST implement merge and rebase and cherry-pick and revert and stash with tests.
Pull request PR-0012 MUST implement branch and tag and remote and revision-walk and log with tests.
Pull request PR-0013 MUST implement diff and apply and blame and patch flows with tests.
Pull request PR-0014 MUST implement submodule and multi-worktree operations with tests.
Pull request PR-0015 MUST implement sparse-checkout and partial clone support with tests.
Pull request PR-0016 MUST implement commit-graph and multi-pack-index and bitmap support with tests.
Pull request PR-0017 MUST implement maintenance flows for gc and repack and prune with tests.
Pull request PR-0018 MUST implement conformance and benchmark and hardening gates and release readiness.
After PR-0018 merge, maintenance pull requests MUST keep spec/state.yaml current_phase equal to total_phases.
After PR-0018 merge, maintenance pull requests MUST NOT modify spec/phase-plan.yaml.
