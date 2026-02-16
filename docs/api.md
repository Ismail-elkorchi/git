# API Documentation

Public API documentation MUST match docs/api-contract.md.
The main entry point MUST export Repo and GitError and GitErrorCode and GitHashAlgorithm.
The node entry point MUST export createNodePorts.
The deno entry point MUST export createDenoPorts.
The bun entry point MUST export createBunPorts.

## Branch Tag Remote Log Walk Contracts

The Repo API MUST include createBranch and createTag operations.
The Repo API MUST include setRemote and listRemotes operations.
The Repo API MUST include revisionWalk and log operations.
Log entries MUST expose oid and parent and author and committer fields.

## Sparse Partial Clone Contracts

The Repo API MUST include setSparseCheckout and sparseCheckoutSelect operations.
The Repo API MUST include negotiatePartialCloneFilter and setPromisorObject and resolvePromisedObject operations.
