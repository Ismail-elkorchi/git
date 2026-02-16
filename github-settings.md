# GitHub Settings

## Branch Protection

The repository MUST configure branch protection for the main branch.
The main branch MUST block direct pushes.
The main branch MUST require pull requests before merging.
The main branch MUST require status checks to pass before merging.
The main branch MUST NOT require conversation resolution before merging.
The main branch MUST require linear history.

## Required Status Checks

The branch protection settings MUST require these checks:
- ci / policy
- ci / node_22
- ci / node_24
- ci / deno_2_6
- ci / bun_1_3
- ci / publish_dry_run
- pr-policy / pr_policy

## Merge Method Policy

The repository MUST allow squash merges.
The repository MUST prohibit merge commits.
The repository MUST prohibit rebase merges.

## Review Policy

The repository MUST set required approving reviews to 0.
The repository MUST NOT require CODEOWNERS reviews for merge.
The repository MUST NOT require stale approval dismissal for merge.
