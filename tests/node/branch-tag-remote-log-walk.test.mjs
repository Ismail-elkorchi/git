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

async function seedCommit(repoRoot) {
	runGitText(["init", "--quiet"], repoRoot);
	await writeFile(`${repoRoot}/seed.txt`, "seed\n", "utf8");
	runGitText(["add", "seed.txt"], repoRoot);
	runGitText(["commit", "-m", "seed"], repoRoot);
}

test("branch and tag creation match git ref targets INV-FEAT-0034", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-branch-tag-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});
	await seedCommit(root);

	const repo = await Repo.open(root);
	const headOid = runGitText(["rev-parse", "HEAD"], root);
	await repo.createBranch("feature-z", headOid);
	await repo.createTag("v3", headOid);

	const headRef = runGitText(["show-ref", "refs/heads/feature-z"], root);
	const tagRef = runGitText(["show-ref", "refs/tags/v3"], root);
	assert.ok(headRef.startsWith(headOid));
	assert.ok(tagRef.startsWith(headOid));
});

test("remote configuration persists deterministic fetch and push mappings INV-FEAT-0035", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-remote-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});
	const repo = await Repo.init(root, { hashAlgorithm: "sha1" });

	await repo.setRemote(
		"origin",
		"refs/heads/*:refs/remotes/origin/*",
		"refs/heads/main:refs/heads/main",
	);
	await repo.setRemote(
		"backup",
		"refs/heads/*:refs/remotes/backup/*",
		"refs/heads/main:refs/heads/main",
	);
	const remotes = await repo.listRemotes();
	assert.deepEqual(
		remotes.map((entry) => entry.name),
		["backup", "origin"],
	);
	assert.equal(remotes[0]?.fetchRefspec, "refs/heads/*:refs/remotes/backup/*");
	assert.equal(remotes[0]?.pushRefspec, "refs/heads/main:refs/heads/main");
});

test("revision walk order is deterministic by traversal mode INV-FEAT-0036", async () => {
	const { Repo } = await import("../../dist/index.js");
	const repo = new Repo("/tmp/codex-walk.git", null, "sha1");
	const commits = [
		{ oid: "c3", parents: ["c2"] },
		{ oid: "c1", parents: [] },
		{ oid: "c2", parents: ["c1"] },
	];

	const topoA = repo.revisionWalk(commits, "topo");
	const topoB = repo.revisionWalk(commits, "topo");
	assert.deepEqual(topoA, topoB);
	assert.deepEqual(
		topoA.map((entry) => entry.oid),
		["c1", "c2", "c3"],
	);

	const reverse = repo.revisionWalk(commits, "reverse");
	assert.deepEqual(
		reverse.map((entry) => entry.oid),
		["c3", "c2", "c1"],
	);
});

test("log entries expose oid parent author committer metadata INV-FEAT-0037 INV-QUAL-0039", async () => {
	const { Repo } = await import("../../dist/index.js");
	const repo = new Repo("/tmp/codex-log.git", null, "sha1");
	const entries = repo.log(
		[
			{ oid: "c2", parents: ["c1"] },
			{ oid: "c1", parents: [] },
		],
		"author-a",
		"committer-b",
		"topo",
	);

	assert.equal(entries.length, 2);
	assert.equal(typeof entries[0]?.oid, "string");
	assert.ok(Object.hasOwn(entries[0] || {}, "parent"));
	assert.equal(entries[0]?.author, "author-a");
	assert.equal(entries[0]?.committer, "committer-b");
});
