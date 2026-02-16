import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("diff generation outputs deterministic unified hunks INV-FEAT-0038", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-diff-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});
	const repo = await Repo.init(root, { hashAlgorithm: "sha1" });

	const patchA = repo.diff("a.txt", "one\n", "one\ntwo\n");
	const patchB = repo.diff("a.txt", "one\n", "one\ntwo\n");
	assert.equal(patchA, patchB);
	assert.ok(patchA.includes("@@ -1,2 +1,3 @@"));
});

test("patch apply supports forward and reverse with index updates INV-FEAT-0039", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-apply-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});
	const repo = await Repo.init(root, { hashAlgorithm: "sha1" });

	await writeFile(`${root}/a.txt`, "old\n", "utf8");
	const patch = repo.diff("a.txt", "old\n", "new\n");
	await repo.applyPatch(patch, { reverse: false, updateIndex: true });
	assert.equal(await readFile(`${root}/a.txt`, "utf8"), "new\n");

	const indexA = await repo.readIndex();
	assert.ok(indexA.entries.some((entry) => entry.path === "a.txt"));

	await repo.applyPatch(patch, { reverse: true, updateIndex: true });
	assert.equal(await readFile(`${root}/a.txt`, "utf8"), "old\n");
});

test("blame maps each line range to one commit and author tuple INV-FEAT-0040", async () => {
	const { Repo } = await import("../../dist/index.js");
	const repo = new Repo("/tmp/codex-blame.git", null, "sha1");
	const tuples = repo.blame(
		["l1", "l2", "l3"],
		[
			{
				startLine: 1,
				endLine: 2,
				oid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				author: "author-a",
			},
			{
				startLine: 3,
				endLine: 3,
				oid: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
				author: "author-b",
			},
		],
	);
	assert.equal(tuples.length, 2);
	assert.equal(tuples[0]?.author, "author-a");
	assert.equal(tuples[1]?.oid, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
});

test("patch apply rejects paths that escape worktree root INV-SECU-0014", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-apply-secu-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});
	const repo = await Repo.init(root, { hashAlgorithm: "sha1" });

	const patch = [
		"--- a/../escape.txt",
		"+++ b/../escape.txt",
		"@@ -1,1 +1,1 @@",
		"-old",
		"+new",
		"",
	].join("\n");

	await assert.rejects(
		() => repo.applyPatch(patch, { reverse: false, updateIndex: false }),
		/error|path|worktree/i,
	);
});
