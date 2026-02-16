import { expect, test } from "bun:test";

test("bun entrypoint import", async () => {
	const mod = await import("../../src/bun.ts");
	expect(mod).toBeDefined();
});
