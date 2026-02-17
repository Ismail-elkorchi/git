import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function runGit(args, cwd, encoding = "utf8") {
	const res = spawnSync("git", args, {
		cwd,
		encoding,
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "Clone Bot",
			GIT_AUTHOR_EMAIL: "clone@example.local",
			GIT_COMMITTER_NAME: "Clone Bot",
			GIT_COMMITTER_EMAIL: "clone@example.local",
		},
	});
	return {
		status: res.status ?? 1,
		stdout: res.stdout || "",
		stderr: res.stderr || "",
	};
}

function runGitText(args, cwd) {
	const res = runGit(args, cwd, "utf8");
	if (res.status !== 0) {
		throw new Error(
			`git command failed ${args.join(" ")} ${String(res.stderr).trim()}`,
		);
	}
	return String(res.stdout).trim();
}

function runGitBytes(args, cwd) {
	const res = runGit(args, cwd, "buffer");
	if (res.status !== 0) {
		throw new Error(
			`git command failed ${args.join(" ")} ${Buffer.from(res.stderr).toString("utf8").trim()}`,
		);
	}
	return new Uint8Array(Buffer.from(res.stdout));
}

function readPktFrame(stream) {
	if (stream.byteLength < 4) throw new Error("pkt stream short");
	const lengthHex = Buffer.from(stream.subarray(0, 4)).toString("utf8");
	const total = Number.parseInt(lengthHex, 16);
	if (!Number.isInteger(total) || total < 4) {
		throw new Error("pkt length invalid");
	}
	return stream.subarray(0, total);
}

function isLockConflict(error) {
	return !!error && typeof error === "object" && error.code === "LOCK_CONFLICT";
}

test("clone local branch selection keeps parity with git clone INV-FEAT-0053", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const sourceRoot = await mkdtemp(
		path.join(os.tmpdir(), "repo-clone-source-"),
	);
	const targetRoot = await mkdtemp(
		path.join(os.tmpdir(), "repo-clone-target-"),
	);
	const baselineRoot = await mkdtemp(path.join(os.tmpdir(), "repo-clone-git-"));
	context.after(async () => {
		await rm(sourceRoot, { recursive: true, force: true });
		await rm(targetRoot, { recursive: true, force: true });
		await rm(baselineRoot, { recursive: true, force: true });
	});

	runGitText(["init", "--quiet"], sourceRoot);
	await writeFile(`${sourceRoot}/seed.txt`, "seed\n", "utf8");
	runGitText(["add", "seed.txt"], sourceRoot);
	runGitText(["commit", "-m", "seed"], sourceRoot);
	const defaultBranch = runGitText(
		["symbolic-ref", "--short", "HEAD"],
		sourceRoot,
	);

	runGitText(["checkout", "-b", "feature-x"], sourceRoot);
	await writeFile(`${sourceRoot}/feature.txt`, "feature\n", "utf8");
	runGitText(["add", "feature.txt"], sourceRoot);
	runGitText(["commit", "-m", "feature"], sourceRoot);
	const featureOid = runGitText(["rev-parse", "HEAD"], sourceRoot);
	runGitText(["checkout", defaultBranch], sourceRoot);

	const cloned = await Repo.clone(sourceRoot, targetRoot, {
		branch: "feature-x",
	});
	assert.equal(cloned.worktreePath, targetRoot);
	assert.equal(runGitText(["rev-parse", "HEAD"], targetRoot), featureOid);
	assert.equal(
		await readFile(`${targetRoot}/feature.txt`, "utf8"),
		"feature\n",
	);
	runGitText(["fsck", "--full"], targetRoot);

	runGitText(
		["clone", "--quiet", "--branch", "feature-x", sourceRoot, baselineRoot],
		sourceRoot,
	);
	assert.equal(
		runGitText(["rev-parse", "HEAD"], targetRoot),
		runGitText(["rev-parse", "HEAD"], baselineRoot),
	);
	assert.equal(
		await readFile(`${targetRoot}/feature.txt`, "utf8"),
		await readFile(`${baselineRoot}/feature.txt`, "utf8"),
	);
});

test("receive-pack plumbing builds pkt-lines and applies guarded ref updates INV-FEAT-0053", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const { parsePktLine } = await import("../../dist/core/protocol/pkt-line.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-receive-pack-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});

	runGitText(["init", "--quiet"], root);
	await writeFile(`${root}/base.txt`, "base\n", "utf8");
	runGitText(["add", "base.txt"], root);
	runGitText(["commit", "-m", "base"], root);
	const defaultBranch = runGitText(["symbolic-ref", "--short", "HEAD"], root);
	const refName = `refs/heads/${defaultBranch}`;
	const oldOid = runGitText(["rev-parse", defaultBranch], root);

	runGitText(["checkout", "-b", "incoming"], root);
	await writeFile(`${root}/incoming.txt`, "incoming\n", "utf8");
	runGitText(["add", "incoming.txt"], root);
	runGitText(["commit", "-m", "incoming"], root);
	const newOid = runGitText(["rev-parse", "incoming"], root);
	runGitText(["checkout", defaultBranch], root);

	const repo = await Repo.open(root);
	const requestBytes = repo.receivePackRequest({ refName, oldOid, newOid }, [
		"report-status",
		"side-band-64k",
	]);
	const requestFrame = readPktFrame(requestBytes);
	const requestPayload = parsePktLine(requestFrame);
	const requestText = new TextDecoder().decode(requestPayload);
	assert.ok(requestText.includes(`${oldOid} ${newOid} ${refName}`));
	assert.ok(requestText.includes("report-status"));
	assert.equal(
		Buffer.from(
			requestBytes.subarray(
				requestFrame.byteLength,
				requestFrame.byteLength + 4,
			),
		).toString("utf8"),
		"0000",
	);

	const advertised = await repo.receivePackAdvertiseRefs(["atomic"]);
	const advertisedFrame = readPktFrame(advertised);
	const advertisedPayload = parsePktLine(advertisedFrame);
	const advertisedText = new TextDecoder().decode(advertisedPayload);
	assert.ok(advertisedText.includes(refName));
	assert.ok(advertisedText.includes("report-status"));
	assert.ok(advertisedText.includes("object-format=sha1"));
	assert.ok(advertisedText.includes("atomic"));

	const gitAdvertised = runGitBytes(
		["receive-pack", "--advertise-refs", root],
		root,
	);
	const gitAdvertisedText = Buffer.from(gitAdvertised).toString("utf8");
	assert.ok(gitAdvertisedText.includes(refName));

	const updated = await repo.receivePackUpdate({ refName, oldOid, newOid });
	assert.equal(updated.refName, refName);
	assert.equal(updated.oid, newOid);
	assert.equal(runGitText(["rev-parse", defaultBranch], root), newOid);
	await assert.rejects(
		() => repo.receivePackUpdate({ refName, oldOid, newOid }),
		isLockConflict,
	);
});
