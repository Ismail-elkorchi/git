# Release Workflow

## Preconditions

- The repository MUST be on a clean working tree.
- `spec/state.yaml` MUST equal `total_phases`.
- `node scripts/check --runtime=node --mode=publish` MUST exit with code 0.

## Commands

```bash
node scripts/check --runtime=node --mode=publish
```

## Artifacts

- The publish dry run MUST execute `npm pack`.
- The publish dry run MUST execute `npx jsr publish --dry-run`.
