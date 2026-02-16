import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function runGit(args, cwd) {
	const res = spawnSync("git", args, {
		cwd,
		encoding: "utf8",
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "Replay Bot",
			GIT_AUTHOR_EMAIL: "replay@example.local",
			GIT_COMMITTER_NAME: "Replay Bot",
			GIT_COMMITTER_EMAIL: "replay@example.local",
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

function writePatchFile(root, name, text) {
	return writeFile(path.join(root, name), text, "utf8");
}

test("replay applies ordered patch sequence with git apply parity", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-replay-"));
	const baselineRoot = await mkdtemp(
		path.join(os.tmpdir(), "repo-replay-baseline-"),
	);
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
		await rm(baselineRoot, { recursive: true, force: true });
	});

	await Repo.init(root, { hashAlgorithm: "sha1" });
	await writeFile(`${root}/a.txt`, "old-a", "utf8");
	await writeFile(`${root}/b.txt`, "old-b", "utf8");
	const repo = await Repo.open(root);

	runGitText(["init", "--quiet"], baselineRoot);
	await writeFile(`${baselineRoot}/a.txt`, "old-a", "utf8");
	await writeFile(`${baselineRoot}/b.txt`, "old-b", "utf8");

	const patchA = [
		"--- a/a.txt",
		"+++ b/a.txt",
		"@@ -1 +1 @@",
		"-old-a",
		"\\ No newline at end of file",
		"+new-a",
		"\\ No newline at end of file",
		"",
	].join("\n");
	const patchB = [
		"--- a/b.txt",
		"+++ b/b.txt",
		"@@ -1 +1 @@",
		"-old-b",
		"\\ No newline at end of file",
		"+new-b",
		"\\ No newline at end of file",
		"",
	].join("\n");
	const replay = await repo.replay(
		[
			{ patchText: patchA, reverse: false },
			{ patchText: patchB, reverse: false },
		],
		{ updateIndex: true },
	);
	assert.equal(replay.status, "completed");
	assert.equal(replay.failedStep, null);
	assert.deepEqual(replay.appliedPaths, ["a.txt", "b.txt"]);
	assert.equal(await readFile(`${root}/a.txt`, "utf8"), "new-a");
	assert.equal(await readFile(`${root}/b.txt`, "utf8"), "new-b");

	await writePatchFile(baselineRoot, "a.patch", patchA);
	await writePatchFile(baselineRoot, "b.patch", patchB);
	assert.equal(
		runGit(["apply", "--unidiff-zero", "a.patch"], baselineRoot).status,
		0,
	);
	assert.equal(
		runGit(["apply", "--unidiff-zero", "b.patch"], baselineRoot).status,
		0,
	);
	assert.equal(
		await readFile(`${baselineRoot}/a.txt`, "utf8"),
		await readFile(`${root}/a.txt`, "utf8"),
	);
	assert.equal(
		await readFile(`${baselineRoot}/b.txt`, "utf8"),
		await readFile(`${root}/b.txt`, "utf8"),
	);
});

test("replay stops on conflict and preserves previously applied patch parity", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-replay-conflict-"));
	const baselineRoot = await mkdtemp(
		path.join(os.tmpdir(), "repo-replay-conflict-baseline-"),
	);
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
		await rm(baselineRoot, { recursive: true, force: true });
	});

	await Repo.init(root, { hashAlgorithm: "sha1" });
	await writeFile(`${root}/a.txt`, "base", "utf8");
	const repo = await Repo.open(root);

	runGitText(["init", "--quiet"], baselineRoot);
	await writeFile(`${baselineRoot}/a.txt`, "base", "utf8");

	const patchA = [
		"--- a/a.txt",
		"+++ b/a.txt",
		"@@ -1 +1 @@",
		"-base",
		"\\ No newline at end of file",
		"+applied",
		"\\ No newline at end of file",
		"",
	].join("\n");
	const patchInvalid = [
		"--- a/../escape.txt",
		"+++ b/../escape.txt",
		"@@ -1,1 +1,1 @@",
		"-old",
		"+new",
		"",
	].join("\n");
	const replay = await repo.replay(
		[
			{ patchText: patchA, reverse: false },
			{ patchText: patchInvalid, reverse: false },
		],
		{ updateIndex: false },
	);
	assert.equal(replay.status, "conflict");
	assert.equal(replay.failedStep, 1);
	assert.deepEqual(replay.appliedPaths, ["a.txt"]);
	assert.equal(await readFile(`${root}/a.txt`, "utf8"), "applied");

	await writePatchFile(baselineRoot, "a.patch", patchA);
	await writePatchFile(baselineRoot, "bad.patch", patchInvalid);
	assert.equal(
		runGit(["apply", "--unidiff-zero", "a.patch"], baselineRoot).status,
		0,
	);
	assert.notEqual(
		runGit(["apply", "--unidiff-zero", "bad.patch"], baselineRoot).status,
		0,
	);
	assert.equal(
		await readFile(`${baselineRoot}/a.txt`, "utf8"),
		await readFile(`${root}/a.txt`, "utf8"),
	);
});
