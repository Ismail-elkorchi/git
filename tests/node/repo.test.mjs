import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function runGitText(args, cwd) {
	const res = spawnSync("git", args, { cwd, encoding: "utf8" });
	if (res.status !== 0) {
		throw new Error(
			`git command failed ${args.join(" ")} ${String(res.stderr || "").trim()}`,
		);
	}
	return String(res.stdout || "").trim();
}

function runGitBytes(args, cwd) {
	const res = spawnSync("git", args, { cwd, encoding: "buffer" });
	if (res.status !== 0) {
		const stderr = Buffer.from(res.stderr || Buffer.alloc(0))
			.toString("utf8")
			.trim();
		throw new Error(`git command failed ${args.join(" ")} ${stderr}`);
	}
	return new Uint8Array(Buffer.from(res.stdout || Buffer.alloc(0)));
}

test("Repo.init creates valid layout INV-FEAT-0001 INV-FEAT-0008 INV-FEAT-0023", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-init-sha1-"));
	context.after(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const repo = await Repo.init(root, { hashAlgorithm: "sha1" });
	assert.equal(repo.hashAlgorithm, "sha1");
	assert.equal(runGitText(["rev-parse", "--show-object-format"], root), "sha1");
	runGitText(["fsck", "--full"], root);
});

test("Repo.init sha256 sets object format INV-FEAT-0024", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-init-sha256-"));
	context.after(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const repo = await Repo.init(root, { hashAlgorithm: "sha256" });
	assert.equal(repo.hashAlgorithm, "sha256");
	assert.equal(
		runGitText(["rev-parse", "--show-object-format"], root),
		"sha256",
	);
});

test("Repo.open accepts git CLI repository INV-FEAT-0002", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-open-"));
	context.after(() => {
		rmSync(root, { recursive: true, force: true });
	});

	runGitText(["init", "--quiet"], root);
	const repo = await Repo.open(root);
	assert.equal(repo.worktreePath, root);
	assert.equal(repo.gitDirPath, `${root}/.git`);
});

test("Repo.writeBlob and Repo.readObject match git cat-file INV-FEAT-0003 INV-FEAT-0004", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-objects-"));
	context.after(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const repo = await Repo.init(root, { hashAlgorithm: "sha1" });
	const payload = new Uint8Array([
		0x67, 0x69, 0x74, 0x00, 0x63, 0x6f, 0x72, 0x65,
	]);
	const oid = await repo.writeBlob(payload);

	const gitBytes = runGitBytes(["cat-file", "blob", oid], root);
	assert.deepEqual(gitBytes, payload);

	const readBytes = await repo.readObject(oid);
	assert.deepEqual(readBytes, gitBytes);
});
