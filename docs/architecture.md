# Architecture

The public API MUST be exported only from src/index.ts and src/node.ts and src/deno.ts and src/bun.ts.
The repository MUST implement ports under src/ports.
The repository MUST implement pure logic under src/core.
The repository MUST implement runtime adapters under src/adapters.
Modules under src/core MUST NOT import runtime adapter modules under src/adapters.
Modules under src/core MUST access system capabilities only through ports under src/ports.
Modules under src/adapters MUST implement ports under src/ports.
The repository MUST prohibit export-star statements in public entry points.
