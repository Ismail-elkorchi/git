# Security

Production code under src MUST NOT execute external processes.
Production code under src MUST NOT access environment variables.
Production code under src MUST NOT prompt for input.
The codebase MUST NOT use eval.
The codebase MUST NOT use the Function constructor.
The library MUST validate all untrusted inputs.
The library MUST enforce inflate limits on decompression.
The library MUST reject path traversal during checkout.
