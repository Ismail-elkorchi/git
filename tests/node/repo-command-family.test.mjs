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
			GIT_AUTHOR_NAME: "Repo Command Bot",
			GIT_AUTHOR_EMAIL: "repo-command@example.local",
			GIT_COMMITTER_NAME: "Repo Command Bot",
			GIT_COMMITTER_EMAIL: "repo-command@example.local",
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

function parseKeyValue(text) {
	const out = {};
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (line.length === 0) continue;
		const idx = line.indexOf("=");
		if (idx < 0) continue;
		const key = line.slice(0, idx);
		const value = line.slice(idx + 1);
		out[key] = value;
	}
	return out;
}

function isInvalidArgumentError(error) {
	return (
		!!error && typeof error === "object" && error.code === "INVALID_ARGUMENT"
	);
}

test("repo info matches git repo info keyvalue parity", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-command-info-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});

	runGitText(["init", "--quiet"], root);
	const repo = await Repo.open(root);
	const infoKeys = [
		"layout.bare",
		"layout.shallow",
		"object.format",
		"references.format",
	];
	const expectedAll = parseKeyValue(
		runGitText(["repo", "info", "--format=keyvalue", ...infoKeys], root),
	);
	const actualAll = await repo.repoInfo({ keys: infoKeys });
	assert.deepEqual(actualAll, expectedAll);

	const expectedSelected = parseKeyValue(
		runGitText(
			["repo", "info", "--format=keyvalue", "object.format", "layout.bare"],
			root,
		),
	);
	const actualSelected = await repo.repoInfo({
		keys: ["object.format", "layout.bare"],
	});
	assert.deepEqual(actualSelected, expectedSelected);

	assert.notEqual(
		runGit(["repo", "info", "--format=keyvalue", "worktree"], root).status,
		0,
	);
	await assert.rejects(
		() => repo.repoInfo({ keys: ["worktree"] }),
		isInvalidArgumentError,
	);
});

test("repo structure matches git repo structure keyvalue parity", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-command-structure-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});

	runGitText(["init", "--quiet"], root);
	await writeFile(`${root}/a.txt`, "alpha\n", "utf8");
	runGitText(["add", "a.txt"], root);
	runGitText(["commit", "-m", "c1"], root);
	runGitText(["tag", "-a", "v1", "-m", "v1"], root);

	const expected = parseKeyValue(
		runGitText(["repo", "structure", "--format=keyvalue"], root),
	);
	const repo = await Repo.open(root);
	const actual = await repo.repoStructure();
	const actualByExpected = {};
	for (const key of Object.keys(expected)) {
		actualByExpected[key] = actual[key];
	}
	assert.deepEqual(actualByExpected, expected);
});
