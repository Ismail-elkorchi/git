import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("Repo.add writes index v2 and stages path INV-FEAT-0015 INV-FEAT-0016", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-index-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});

	const repo = await Repo.init(root, { hashAlgorithm: "sha1" });
	await writeFile(`${root}/file-a.txt`, "alpha\n", "utf8");
	await repo.add(["file-a.txt"]);

	const indexBytes = new Uint8Array(await readFile(`${root}/.git/index`));
	assert.equal(String.fromCharCode(...indexBytes.subarray(0, 4)), "DIRC");
	assert.equal(indexBytes[7], 2);

	const index = await repo.readIndex();
	assert.equal(index.version, 2);
	assert.equal(index.entries[0]?.path, "file-a.txt");
});

test("Repo.status reports deterministic staged and unstaged changes INV-FEAT-0019", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-status-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});

	const repo = await Repo.init(root, { hashAlgorithm: "sha1" });
	await writeFile(`${root}/file-b.txt`, "one\n", "utf8");
	await repo.add(["file-b.txt"]);
	await writeFile(`${root}/file-b.txt`, "two\n", "utf8");

	const statusA = await repo.status();
	const statusB = await repo.status();
	assert.deepEqual(statusA, statusB);
	assert.deepEqual(statusA.staged, ["file-b.txt"]);
	assert.deepEqual(statusA.unstaged, ["file-b.txt"]);
});

test("Repo.checkout materializes files and blocks traversal INV-FEAT-0017 INV-FEAT-0018", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-checkout-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});

	const repo = await Repo.init(root, { hashAlgorithm: "sha1" });
	await repo.checkout({
		"dir-x/file-c.txt": "payload\n",
	});

	const fileText = await readFile(`${root}/dir-x/file-c.txt`, "utf8");
	assert.equal(fileText, "payload\n");

	await assert.rejects(
		() =>
			repo.checkout({
				"../escape.txt": "x",
			}),
		/error|path|worktree/i,
	);
});
