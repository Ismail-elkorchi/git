import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function runGit(args, cwd) {
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

function commitFixture(repoPath) {
	runGitText(["init", "--quiet"], repoPath);
	runGitText(["commit", "--allow-empty", "-m", "seed"], repoPath);
}

function parseForEachRefRows(text) {
	if (text.trim().length === 0) return [];
	return text
		.trim()
		.split("\n")
		.map((line) => {
			const m = line.trim().match(/^(\S+)\s+([0-9a-f]{40}|[0-9a-f]{64})$/);
			if (!m) throw new Error(`for-each-ref output invalid ${line}`);
			const refName = m[1];
			const oid = m[2];
			if (!refName || !oid) {
				throw new Error(`for-each-ref output invalid ${line}`);
			}
			return { refName, oid };
		});
}

test("Repo.resolveHead matches git rev-parse HEAD INV-FEAT-0011", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-head-"));
	context.after(() => {
		rmSync(root, { recursive: true, force: true });
	});

	commitFixture(root);
	const repo = await Repo.open(root);
	const expected = runGitText(["rev-parse", "HEAD"], root);
	const actual = await repo.resolveHead();
	assert.equal(actual, expected);
});

test("Repo.updateRef writes loose ref that git show-ref reads INV-FEAT-0012 INV-FEAT-0014", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-ref-update-"));
	context.after(() => {
		rmSync(root, { recursive: true, force: true });
	});

	commitFixture(root);
	const repo = await Repo.open(root);
	const headOid = runGitText(["rev-parse", "HEAD"], root);
	await repo.updateRef("refs/heads/feature-a", headOid, "sync ref");

	const showRef = runGitText(["show-ref", "refs/heads/feature-a"], root);
	assert.ok(showRef.startsWith(headOid));

	const logPath = `${root}/.git/logs/refs/heads/feature-a`;
	const reflog = await import("node:fs/promises").then((fs) =>
		fs.readFile(logPath, "utf8"),
	);
	assert.ok(reflog.includes(headOid));
	assert.ok(reflog.includes("sync ref"));
});

test("Repo.resolveRef reads packed-refs entries INV-FEAT-0013", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-packed-refs-"));
	context.after(() => {
		rmSync(root, { recursive: true, force: true });
	});

	commitFixture(root);
	runGitText(["tag", "v1"], root);
	runGitText(["pack-refs", "--all"], root);

	const repo = await Repo.open(root);
	const expected = runGitText(["rev-parse", "refs/tags/v1"], root);
	const actual = await repo.resolveRef("refs/tags/v1");
	assert.equal(actual, expected);
});

test("Repo.createRef and Repo.listRefs and Repo.verifyRef match git refs parity INV-FEAT-0012 INV-FEAT-0013", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-refs-parity-"));
	context.after(() => {
		rmSync(root, { recursive: true, force: true });
	});

	commitFixture(root);
	const repo = await Repo.open(root);
	const headOid = runGitText(["rev-parse", "HEAD"], root);
	const createdRef = await repo.createRef(
		"heads/feature-b",
		headOid,
		"refs-create",
	);
	assert.equal(createdRef, "refs/heads/feature-b");
	assert.equal(await repo.verifyRef("refs/heads/feature-b", headOid), true);
	assert.equal(
		await repo.verifyRef("refs/heads/feature-b", "0".repeat(headOid.length)),
		false,
	);
	await assert.rejects(
		() => repo.createRef("refs/heads/feature-b", headOid, "refs-create"),
		/reference already exists/,
	);

	const expectedRows = parseForEachRefRows(
		runGitText(
			["for-each-ref", "refs/heads", "--format=%(refname) %(objectname)"],
			root,
		),
	).sort((a, b) => a.refName.localeCompare(b.refName));
	const actualRows = (await repo.listRefs("refs/heads")).sort((a, b) =>
		a.refName.localeCompare(b.refName),
	);
	assert.deepEqual(actualRows, expectedRows);
});

test("Repo.deleteRef removes loose and packed refs and writes reflog parity INV-FEAT-0012 INV-FEAT-0013 INV-FEAT-0014", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-delete-refs-"));
	context.after(() => {
		rmSync(root, { recursive: true, force: true });
	});

	commitFixture(root);
	const repo = await Repo.open(root);
	const headOid = runGitText(["rev-parse", "HEAD"], root);

	await repo.createRef("refs/heads/remove-me", headOid, "create remove-me");
	await repo.deleteRef("refs/heads/remove-me", "delete remove-me");
	const missingLoose = runGit(
		["show-ref", "--verify", "refs/heads/remove-me"],
		root,
	);
	assert.notEqual(missingLoose.status, 0);
	assert.equal(await repo.resolveRef("refs/heads/remove-me"), null);
	const reflogPath = `${root}/.git/logs/refs/heads/remove-me`;
	const looseReflog = await import("node:fs/promises").then((fs) =>
		fs.readFile(reflogPath, "utf8"),
	);
	assert.ok(looseReflog.includes(headOid));
	assert.ok(looseReflog.includes("0".repeat(headOid.length)));
	assert.ok(looseReflog.includes("delete remove-me"));

	runGitText(["tag", "packed-v1"], root);
	runGitText(["pack-refs", "--all"], root);
	await repo.deleteRef("refs/tags/packed-v1", "delete packed-v1");
	const missingPacked = runGit(
		["show-ref", "--verify", "refs/tags/packed-v1"],
		root,
	);
	assert.notEqual(missingPacked.status, 0);
	assert.equal(await repo.resolveRef("refs/tags/packed-v1"), null);

	const packedRefsPath = `${root}/.git/packed-refs`;
	const packedRefsText = await import("node:fs/promises").then((fs) =>
		fs.readFile(packedRefsPath, "utf8"),
	);
	assert.equal(packedRefsText.includes("refs/tags/packed-v1"), false);
});
