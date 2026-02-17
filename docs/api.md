# API Documentation

Public API documentation MUST match docs/api-contract.md.
The main entry point MUST export Repo and GitError and GitErrorCode and GitHashAlgorithm.
The node entry point MUST export createNodePorts.
The deno entry point MUST export createDenoPorts.
The bun entry point MUST export createBunPorts.

## Branch Tag Remote Log Walk Contracts

The Repo API MUST include createRef and listRefs and deleteRef and verifyRef operations.
The Repo API MUST include createBranch and createTag operations.
The Repo API MUST include setRemote and listRemotes operations.
The Repo API MUST include clone operation with branch and depth and filter and recurseSubmodules option support across local path and file URL sources.
The Repo API MUST include receivePackRequest and receivePackAdvertiseRefs and receivePackUpdate operations.
The Repo API MUST include repoInfo and repoStructure operations.
The Repo API MUST include replay operations with deterministic conflict status reporting.
The Repo API MUST include lastModified operation with historyOid and indexOid fields.
The Repo API MUST include revisionWalk and log operations.
Log entries MUST expose oid and parent and author and committer fields.

## Sparse Partial Clone Contracts

The Repo API MUST include setSparseCheckout and sparseCheckoutSelect operations.
The Repo API MUST include negotiatePartialCloneFilter and setPromisorObject and resolvePromisedObject operations.
The Repo API MUST include backfill operation with sparse scope and minBatchSize controls.
The backfill operation MUST validate minBatchSize as an integer value greater than or equal to zero.
The backfill operation MUST select requested object ids in deterministic lexicographic order.
The backfill operation MUST limit requested object ids to sparse-selected index paths when sparse mode is enabled.
The backfill operation MUST write fetched promised objects into object storage and remove fetched ids from promisorObjects state.

## Graph Index Bitmap Contracts

The Repo API MUST include writeCommitGraph and readCommitGraph operations.
The Repo API MUST include writeMultiPackIndex and readMultiPackIndex operations.
The Repo API MUST include writeBitmapIndex and readBitmapIndex operations.

## Maintenance Contracts

The Repo API MUST include runMaintenance with gc and repack and prune stage progress events.

## Hardening Contracts

The Repo API MUST include verifyCommitSignature and verifyTagSignature operations.
The Repo API MUST include evaluateIgnore and evaluateAttributes operations.
The Repo API MUST include addNote and getNote and removeNote operations.
The Repo API MUST include addReplace and resolveReplace operations.
The Repo API MUST include negotiateTransportCapabilities operation.
