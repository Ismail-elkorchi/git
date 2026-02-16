import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("merge supports fast-forward and true-merge parent ordering INV-FEAT-0029", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-merge-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});
	const repo = await Repo.init(root, { hashAlgorithm: "sha1" });

	const ff = repo.mergeCommits(
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		true,
	);
	assert.equal(ff.mode, "fast-forward");
	assert.deepEqual(ff.parents, ["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]);

	const trueMerge = repo.mergeCommits(
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		false,
	);
	assert.equal(trueMerge.mode, "merge-commit");
	assert.deepEqual(trueMerge.parents, [
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
	]);
});

test("rebase continue and abort transitions use deterministic state files INV-FEAT-0030", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-rebase-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});
	const repo = await Repo.init(root, { hashAlgorithm: "sha1" });

	const start = await repo.rebaseStart(
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		["c1", "c2"],
	);
	assert.equal(start.status, "active");

	const next = await repo.rebaseContinue();
	assert.equal(next.currentIndex, 1);
	assert.equal(next.status, "active");

	const aborted = await repo.rebaseAbort();
	assert.equal(aborted.status, "aborted");

	const statePath = `${root}/.git/rebase-codex/state.json`;
	const stateText = await readFile(statePath, "utf8");
	const parsed = JSON.parse(stateText);
	assert.equal(parsed.status, "aborted");
	assert.equal(parsed.currentIndex, 1);
});

test("cherry-pick and revert commit payload generation is deterministic INV-FEAT-0031 INV-FEAT-0032", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-history-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});
	const repo = await Repo.init(root, { hashAlgorithm: "sha1" });

	const cherryA = await repo.cherryPick(
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
	);
	const cherryB = await repo.cherryPick(
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
	);
	assert.equal(cherryA, cherryB);

	const revertA = await repo.revert(
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
	);
	const revertB = await repo.revert(
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
	);
	assert.equal(revertA, revertB);
});

test("stash save/list/apply/drop supports stash ref style identifiers INV-FEAT-0033", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-stash-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});
	const repo = await Repo.init(root, { hashAlgorithm: "sha1" });

	const first = await repo.stashSave(
		"save a",
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	);
	assert.equal(first, "stash@{0}");
	const second = await repo.stashSave(
		"save b",
		"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
	);
	assert.equal(second, "stash@{0}");

	const listed = await repo.stashList();
	assert.equal(listed.length, 2);
	assert.equal(listed[0]?.id, "stash@{0}");
	assert.equal(listed[1]?.id, "stash@{1}");

	const applied = await repo.stashApply("stash@{0}");
	assert.equal(applied.treeOid, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");

	await repo.stashDrop("stash@{0}");
	const afterDrop = await repo.stashList();
	assert.equal(afterDrop.length, 1);
	assert.equal(afterDrop[0]?.id, "stash@{0}");
});
