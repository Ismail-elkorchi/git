import assert from "node:assert/strict";
import test from "node:test";

test("node entrypoints import", async () => {
	const main = await import("../../dist/index.js");
	const node = await import("../../dist/node.js");
	assert.ok(main);
	assert.ok(node);
});
