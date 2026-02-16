import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function runGit(args, input, cwd) {
	const res = spawnSync("git", args, {
		cwd,
		input,
		encoding: "utf8",
	});
	if (res.status !== 0) {
		const stderr = String(res.stderr || "").trim();
		throw new Error(`git command failed ${args.join(" ")} ${stderr}`);
	}
	return String(res.stdout || "").trim();
}

test("sha1 hash matches git hash-object INV-FEAT-0005", async () => {
	const { hashGitObject } = await import("../../dist/core/crypto/hash.js");
	const payload = new Uint8Array([
		0x67, 0x69, 0x74, 0x0a, 0x00, 0x63, 0x6f, 0x72, 0x65,
	]);
	const expected = runGit(
		["hash-object", "--stdin"],
		Buffer.from(payload),
		process.cwd(),
	);
	const actual = await hashGitObject("blob", payload, "sha1");
	assert.equal(actual, expected);
});

test("sha256 hash matches git sha256 repo hash-object INV-FEAT-0006", async (context) => {
	const { hashGitObject } = await import("../../dist/core/crypto/hash.js");
	const payload = new Uint8Array([
		0x70, 0x6f, 0x72, 0x74, 0x73, 0x0a, 0x00, 0x74, 0x65, 0x73, 0x74,
	]);
	const repoRoot = await mkdtemp(path.join(os.tmpdir(), "git-sha256-"));
	context.after(() => {
		rmSync(repoRoot, { recursive: true, force: true });
	});
	runGit(["init", "--quiet", "--object-format=sha256"], null, repoRoot);
	const expected = runGit(
		["hash-object", "--stdin"],
		Buffer.from(payload),
		repoRoot,
	);
	const actual = await hashGitObject("blob", payload, "sha256");
	assert.equal(actual, expected);
});
