import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function runGit(args, cwd) {
	const res = spawnSync("git", args, {
		cwd,
		encoding: "utf8",
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "Backfill Bot",
			GIT_AUTHOR_EMAIL: "backfill@example.local",
			GIT_COMMITTER_NAME: "Backfill Bot",
			GIT_COMMITTER_EMAIL: "backfill@example.local",
		},
	});
	return {
		status: res.status ?? 1,
		stdout: String(res.stdout || ""),
		stderr: String(res.stderr || ""),
	};
}

function runGitText(args, cwd) {
	const res = runGit(args, cwd);
	if (res.status !== 0) {
		throw new Error(
			`git command failed ${args.join(" ")} ${res.stderr.trim()}`,
		);
	}
	return res.stdout.trim();
}

function isInvalidArgumentError(error) {
	return (
		!!error && typeof error === "object" && error.code === "INVALID_ARGUMENT"
	);
}

test("backfill option validation matches git backfill status parity", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-backfill-cli-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});

	runGitText(["init", "--quiet"], root);
	await writeFile(`${root}/seed.txt`, "seed\n", "utf8");
	runGitText(["add", "seed.txt"], root);
	runGitText(["commit", "-m", "seed"], root);

	const baselineStatus = runGit(["backfill"], root).status;
	const sparseStatus = runGit(["backfill", "--sparse"], root).status;
	const zeroBatchStatus = runGit(
		["backfill", "--min-batch-size=0"],
		root,
	).status;
	assert.notEqual(baselineStatus, 129);
	assert.notEqual(sparseStatus, 129);
	assert.notEqual(zeroBatchStatus, 129);
	assert.notEqual(runGit(["backfill", "--min-batch-size=-1"], root).status, 0);

	const repo = await Repo.open(root);
	await assert.rejects(
		() => repo.backfill({ minBatchSize: -1 }),
		isInvalidArgumentError,
	);
	const result = await repo.backfill({ minBatchSize: 0, sparse: true });
	assert.equal(result.status, "completed");
	assert.deepEqual(result.requestedOids, []);
	assert.deepEqual(result.fetchedOids, []);
	assert.deepEqual(result.remainingPromisorOids, []);
});

test("backfill hydrates promisor objects with sparse scope and batch threshold semantics", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-backfill-flow-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});

	await Repo.init(root, { hashAlgorithm: "sha1" });
	const repo = await Repo.open(root);
	await writeFile(`${root}/a.txt`, "alpha\n", "utf8");
	await writeFile(`${root}/b.txt`, "beta\n", "utf8");
	await repo.add(["a.txt", "b.txt"]);
	await repo.setSparseCheckout("pattern", ["a.txt"]);

	const index = await repo.readIndex();
	const aOid = index.entries.find((entry) => entry.path === "a.txt")?.oid;
	const bOid = index.entries.find((entry) => entry.path === "b.txt")?.oid;
	assert.equal(typeof aOid, "string");
	assert.equal(typeof bOid, "string");

	const fakeOid = "f".repeat(40);
	await repo.setPromisorObject(aOid, "promised-a");
	await repo.setPromisorObject(fakeOid, "promised-fake");
	const existingA = new TextDecoder().decode(await repo.readObject(aOid));
	assert.equal(existingA, "alpha\n");

	const sparseResult = await repo.backfill({ sparse: true, minBatchSize: 1 });
	assert.equal(sparseResult.status, "completed");
	assert.deepEqual(sparseResult.requestedOids, [aOid]);
	assert.deepEqual(sparseResult.fetchedOids, [aOid]);
	assert.deepEqual(sparseResult.remainingPromisorOids, [fakeOid]);

	assert.equal(
		new TextDecoder().decode(await repo.resolvePromisedObject(aOid)),
		"alpha\n",
	);
	assert.equal(
		new TextDecoder().decode(await repo.resolvePromisedObject(fakeOid)),
		"promised-fake",
	);

	const skippedResult = await repo.backfill({ minBatchSize: 2 });
	assert.equal(skippedResult.status, "skipped-min-batch-size");
	assert.deepEqual(skippedResult.requestedOids, [fakeOid]);
	assert.deepEqual(skippedResult.fetchedOids, []);
	assert.deepEqual(skippedResult.remainingPromisorOids, [fakeOid]);

	const completedResult = await repo.backfill({ minBatchSize: 1 });
	assert.equal(completedResult.status, "completed");
	assert.deepEqual(completedResult.requestedOids, [fakeOid]);
	assert.deepEqual(completedResult.fetchedOids, [fakeOid]);
	assert.deepEqual(completedResult.remainingPromisorOids, []);
	assert.equal(
		new TextDecoder().decode(await repo.resolvePromisedObject(fakeOid)),
		"promised-fake",
	);
});
