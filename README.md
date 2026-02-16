# @ismail-elkorchi/git

Pure TypeScript Git core with runtime adapters for Node and Deno and Bun.

## Scope

- The library MUST expose the API declared in `docs/api-contract.md`.
- The library MUST keep verification gates green via `node scripts/check`.
- The library MUST keep release flow reproducible with `npm pack` and `npx jsr publish --dry-run`.
- The library MUST track Git command-family parity in `docs/parity-matrix.md`.

## Quick Start

```bash
npm install
node scripts/check
```

## Release

Release workflow details are documented in `docs/release.md`.
