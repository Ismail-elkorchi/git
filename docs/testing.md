# Testing

Unit tests MUST run under the runtime selected by scripts/check.
Integration tests MUST run against local git CLI fixtures.
Tests MUST emit Evidence Artifacts under artifacts/gates for activated Invariants.
Tests MUST NOT access non-local network addresses.
