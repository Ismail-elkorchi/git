# API Documentation

Public API documentation MUST match docs/api-contract.md.
The main entry point MUST export Repo and GitError and GitErrorCode and GitHashAlgorithm.
The node entry point MUST export createNodePorts.
The deno entry point MUST export createDenoPorts.
The bun entry point MUST export createBunPorts.
