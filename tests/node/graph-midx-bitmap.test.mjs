import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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
	await writeFile(path.join(root, "a.txt"), "a\n", "utf8");
	runGitText(["add", "a.txt"], root);
	runGitText(["commit", "-m", "a"], root);
	await writeFile(path.join(root, "b.txt"), "b\n", "utf8");
	runGitText(["add", "b.txt"], root);
	runGitText(["commit", "-m", "b"], root);
}

test("commit-graph write and verify parity INV-FEAT-0045", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-commit-graph-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});

	await seedHistory(root);
	runGitText(["commit-graph", "write", "--reachable"], root);
	const commitGraphPath = path.join(
		root,
		".git",
		"objects",
		"info",
		"commit-graph",
	);
	const commitGraphBytes = new Uint8Array(await readFile(commitGraphPath));
	await rm(commitGraphPath, { force: true });

	const repo = await Repo.open(root);
	const writtenPath = await repo.writeCommitGraph(commitGraphBytes);
	runGitText(["commit-graph", "verify"], root);

	const roundTrip = await repo.readCommitGraph();
	assert.equal(roundTrip.byteLength, commitGraphBytes.byteLength);
	assert.equal(writtenPath.endsWith("/commit-graph"), true);
});

test("multi-pack-index write and verify parity INV-FEAT-0046", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-midx-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});

	await seedHistory(root);
	runGitText(["gc", "--aggressive", "--prune=now"], root);
	runGitText(["multi-pack-index", "write"], root);
	const midxPath = path.join(
		root,
		".git",
		"objects",
		"pack",
		"multi-pack-index",
	);
	const midxBytes = new Uint8Array(await readFile(midxPath));
	await rm(midxPath, { force: true });

	const repo = await Repo.open(root);
	const writtenPath = await repo.writeMultiPackIndex(midxBytes);
	runGitText(["multi-pack-index", "verify"], root);

	const roundTrip = await repo.readMultiPackIndex();
	assert.equal(roundTrip.byteLength, midxBytes.byteLength);
	assert.equal(writtenPath.endsWith("/multi-pack-index"), true);
});

test("bitmap write/read keeps reachable set stable INV-FEAT-0047", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-bitmap-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});

	await seedHistory(root);
	runGitText(["config", "repack.writeBitmaps", "true"], root);
	runGitText(["repack", "-adb"], root);

	const packDir = path.join(root, ".git", "objects", "pack");
	const names = await readdir(packDir);
	const packName = names.find((name) => name.endsWith(".pack"));
	if (!packName) {
		throw new Error("pack fixture missing");
	}
	const packBaseName = packName.replace(/\.pack$/, "");
	const bitmapBytes = new Uint8Array(
		await readFile(path.join(packDir, `${packBaseName}.bitmap`)),
	);
	await rm(path.join(packDir, `${packBaseName}.bitmap`), { force: true });

	const reachableBefore = runGitText(["rev-list", "--objects", "--all"], root);
	const repo = await Repo.open(root);
	await repo.writeBitmapIndex(packBaseName, bitmapBytes);
	const roundTrip = await repo.readBitmapIndex(packBaseName);
	const reachableAfter = runGitText(["rev-list", "--objects", "--all"], root);

	assert.equal(roundTrip.byteLength, bitmapBytes.byteLength);
	assert.equal(reachableAfter, reachableBefore);
});
