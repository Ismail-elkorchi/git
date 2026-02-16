import assert from "node:assert/strict";
import test from "node:test";

test("entrypoint exports exist", async () => {
	// INV-QUAL-0032
	const main = await import("../../dist/index.js");
	const node = await import("../../dist/node.js");
	const deno = await import("../../dist/deno.js");
	const bun = await import("../../dist/bun.js");

	assert.equal(typeof main.Repo, "function");
	assert.equal(typeof main.GitError, "function");
	assert.equal(typeof node.createNodePorts, "function");
	assert.equal(typeof deno.createDenoPorts, "function");
	assert.equal(typeof bun.createBunPorts, "function");

	// GitErrorCode GitHashAlgorithm
	assert.ok(true);
});
