import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
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

function commitFixture(repoPath) {
	runGitText(["init", "--quiet"], repoPath);
	runGitText(["commit", "--allow-empty", "-m", "seed"], repoPath);
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
