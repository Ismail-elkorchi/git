# API Contract

The library MUST implement the exports listed in this document.
The library MUST validate exports via scripts/contract_check.

## Exports

The main entry point MUST export Repo.
The main entry point MUST export GitError.
The main entry point MUST export GitErrorCode.
The main entry point MUST export GitHashAlgorithm.
The node entry point MUST export createNodePorts.
The deno entry point MUST export createDenoPorts.
The bun entry point MUST export createBunPorts.
