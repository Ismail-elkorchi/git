import assert from "node:assert/strict";
import test from "node:test";

test("default inflate limits match security invariants INV-SECU-0006 INV-SECU-0007", async () => {
	const limits = await import("../../dist/core/compress/limits.js");
	assert.equal(limits.DEFAULT_MAX_INFLATED_BYTES, 134_217_728);
	assert.equal(limits.DEFAULT_MAX_INFLATE_RATIO, 200);
});

test("inflateRaw enforces limits INV-FEAT-0007", async () => {
	const { WebCompressionAdapter } = await import(
		"../../dist/adapters/web-compression.js"
	);
	const adapter = new WebCompressionAdapter();
	const input = new Uint8Array(4096).fill(65);
	const compressed = await adapter.deflateRaw(input);

	await assert.rejects(
		() =>
			adapter.inflateRaw(compressed, {
				maxInflatedBytes: 512,
				maxInflateRatio: 4,
			}),
		/error|limit/i,
	);

	const inflated = await adapter.inflateRaw(compressed);
	assert.deepEqual(inflated, input);
});

test("crc32 vector matches canonical result", async () => {
	const { crc32Hex } = await import("../../dist/core/compress/crc32.js");
	const payload = new TextEncoder().encode("123456789");
	assert.equal(crc32Hex(payload), "cbf43926");
});
