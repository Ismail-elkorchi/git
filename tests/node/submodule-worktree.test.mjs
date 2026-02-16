import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("submodule operations update gitlink metadata entries INV-FEAT-0041", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-submodule-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});
	const repo = await Repo.init(root, { hashAlgorithm: "sha1" });

	await repo.addSubmodule(
		"modules/lib-a",
		"http://127.0.0.1/lib-a.git",
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	);
	await repo.addSubmodule(
		"modules/lib-b",
		"http://127.0.0.1/lib-b.git",
		"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
	);

	const submodules = await repo.listSubmodules();
	assert.equal(submodules.length, 2);
	assert.equal(submodules[0]?.path, "modules/lib-a");
	assert.equal(
		submodules[0]?.gitlinkOid,
		"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	);
});

test("worktree operations create list prune linked metadata INV-FEAT-0042", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-worktree-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});
	const repo = await Repo.init(root, { hashAlgorithm: "sha1" });

	await repo.addWorktree("worktrees/alpha", "refs/heads/alpha");
	await repo.addWorktree("worktrees/beta", "refs/heads/beta");
	let listed = await repo.listWorktrees();
	assert.deepEqual(
		listed.map((entry) => entry.path),
		["worktrees/alpha", "worktrees/beta"],
	);

	await repo.markWorktreePrunable("worktrees/alpha");
	await repo.pruneWorktrees();
	listed = await repo.listWorktrees();
	assert.deepEqual(
		listed.map((entry) => entry.path),
		["worktrees/beta"],
	);
});

test("submodule and worktree path validation rejects escape paths INV-SECU-0015", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-submodule-secu-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});
	const repo = await Repo.init(root, { hashAlgorithm: "sha1" });

	await assert.rejects(
		() =>
			repo.addSubmodule(
				"../escape",
				"http://127.0.0.1/escape.git",
				"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			),
		/error|path|worktree/i,
	);

	await assert.rejects(
		() => repo.addWorktree("../escape", "refs/heads/escape"),
		/error|path|worktree/i,
	);
});
