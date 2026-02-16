import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function runGitText(args, cwd) {
	const res = spawnSync("git", args, {
		cwd,
		encoding: "utf8",
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "Repo Bot",
			GIT_AUTHOR_EMAIL: "repo@example.local",
			GIT_COMMITTER_NAME: "Repo Bot",
			GIT_COMMITTER_EMAIL: "repo@example.local",
		},
	});
	if (res.status !== 0) {
		throw new Error(
			`git command failed ${args.join(" ")} ${String(res.stderr || "").trim()}`,
		);
	}
	return String(res.stdout || "").trim();
}

async function seedHistory(root) {
	runGitText(["init", "--quiet"], root);
	await writeFile(path.join(root, "file.txt"), "v1\n", "utf8");
	runGitText(["add", "file.txt"], root);
	runGitText(["commit", "-m", "seed"], root);
}

test("maintenance run keeps refs and reachable objects stable INV-FEAT-0048", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-maintenance-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});

	await seedHistory(root);
	const refsBefore = runGitText(["show-ref"], root);
	const reachableBefore = runGitText(["rev-list", "--objects", "--all"], root);
	const headOid = runGitText(["rev-parse", "HEAD"], root);

	const repo = await Repo.open(root);
	const summary = await repo.runMaintenance({ pruneLooseObjects: true });

	const refsAfter = runGitText(["show-ref"], root);
	const reachableAfter = runGitText(["rev-list", "--objects", "--all"], root);
	assert.equal(refsAfter, refsBefore);
	assert.equal(reachableAfter, reachableBefore);
	assert.equal(summary.stages.join(","), "gc,repack,prune");
	assert.ok(summary.reachableObjects.includes(headOid));
});

test("maintenance progress events are deterministic INV-OPER-0003", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-maint-progress-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});

	await seedHistory(root);
	const repo = await Repo.open(root);
	const stages = [];
	const totals = [];
	await repo.runMaintenance({
		onProgress: (event) => {
			stages.push(event.stage);
			totals.push(event.total);
		},
	});

	assert.deepEqual(stages, ["gc", "repack", "prune"]);
	assert.deepEqual(totals, [3, 3, 3]);
});
