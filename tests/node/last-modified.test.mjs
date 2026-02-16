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
			GIT_AUTHOR_NAME: "LastModified Bot",
			GIT_AUTHOR_EMAIL: "last-modified@example.local",
			GIT_COMMITTER_NAME: "LastModified Bot",
			GIT_COMMITTER_EMAIL: "last-modified@example.local",
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

function parseIndexOid(stageText) {
	const trimmed = stageText.trim();
	if (trimmed.length === 0) return null;
	const firstLine = trimmed.split(/\r?\n/)[0] || "";
	const columns = firstLine.trim().split(/\s+/);
	if (columns.length < 2) return null;
	return columns[1];
}

test("last-modified returns history and index oids with git log and ls-files parity", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-last-modified-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});

	runGitText(["init", "--quiet"], root);
	await writeFile(`${root}/tracked.txt`, "v1\n", "utf8");
	runGitText(["add", "tracked.txt"], root);
	runGitText(["commit", "-m", "tracked-v1"], root);
	const trackedV1Oid = runGitText(["rev-parse", "HEAD"], root);

	await writeFile(`${root}/other.txt`, "other\n", "utf8");
	runGitText(["add", "other.txt"], root);
	runGitText(["commit", "-m", "other-v1"], root);

	await writeFile(`${root}/tracked.txt`, "v2\n", "utf8");
	runGitText(["add", "tracked.txt"], root);
	const expectedHistoryOid = runGitText(
		["log", "-1", "--format=%H", "HEAD", "--", "tracked.txt"],
		root,
	);
	const expectedIndexOid = parseIndexOid(
		runGitText(["ls-files", "--stage", "--", "tracked.txt"], root),
	);

	const repo = await Repo.open(root);
	const result = await repo.lastModified("tracked.txt");
	assert.equal(result.path, "tracked.txt");
	assert.equal(result.historyOid, expectedHistoryOid);
	assert.equal(result.historyOid, trackedV1Oid);
	assert.equal(result.indexOid, expectedIndexOid);
});

test("last-modified returns null history and index oids for unknown path", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(
		path.join(os.tmpdir(), "repo-last-modified-missing-"),
	);
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});

	runGitText(["init", "--quiet"], root);
	await writeFile(`${root}/seed.txt`, "seed\n", "utf8");
	runGitText(["add", "seed.txt"], root);
	runGitText(["commit", "-m", "seed"], root);

	const historyRes = runGit(
		["log", "-1", "--format=%H", "HEAD", "--", "missing.txt"],
		root,
	);
	assert.equal(historyRes.status, 0);
	assert.equal(historyRes.stdout.trim(), "");
	const indexRes = runGit(["ls-files", "--stage", "--", "missing.txt"], root);
	assert.equal(indexRes.status, 0);
	assert.equal(indexRes.stdout.trim(), "");

	const repo = await Repo.open(root);
	const result = await repo.lastModified("missing.txt");
	assert.equal(result.path, "missing.txt");
	assert.equal(result.historyOid, null);
	assert.equal(result.indexOid, null);
});
