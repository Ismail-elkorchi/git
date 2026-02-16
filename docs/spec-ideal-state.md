# Ideal State Specification

The library MUST provide a pure core Git implementation with runtime adapters for Node and Deno and Bun.
The library MUST support SHA-1 and SHA-256 object formats.
The library MUST implement loose objects and packfiles.
The library MUST implement refs and packed-refs and reflogs.
The library MUST implement index v2 and add and checkout and status.
The library MUST implement Smart HTTP Protocol v2 for fetch and push.
The library MUST interoperate with git CLI fixtures in integration tests.
The library MUST expose a strict TypeScript API defined in docs/api-contract.md.
The library MUST enforce security limits for decompression and protocol parsing.
The library MUST provide deterministic behavior across supported runtimes.
