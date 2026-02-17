import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

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
			GIT_ALLOW_PROTOCOL: "file",
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

async function createCloneNetworkFixture(rootPrefix) {
	const submoduleSourceRoot = await mkdtemp(
		path.join(os.tmpdir(), `${rootPrefix}-submodule-source-`),
	);
	const submoduleBareRoot = await mkdtemp(
		path.join(os.tmpdir(), `${rootPrefix}-submodule-bare-`),
	);
	const superSourceRoot = await mkdtemp(
		path.join(os.tmpdir(), `${rootPrefix}-super-source-`),
	);
	const superBareRoot = await mkdtemp(
		path.join(os.tmpdir(), `${rootPrefix}-super-bare-`),
	);

	runGitText(["init", "--quiet"], submoduleSourceRoot);
	await writeFile(`${submoduleSourceRoot}/sub.txt`, "submodule\n", "utf8");
	runGitText(["add", "sub.txt"], submoduleSourceRoot);
	runGitText(["commit", "-m", "submodule-base"], submoduleSourceRoot);
	runGitText(
		["clone", "--quiet", "--bare", submoduleSourceRoot, submoduleBareRoot],
		submoduleSourceRoot,
	);

	runGitText(["init", "--quiet"], superSourceRoot);
	await writeFile(`${superSourceRoot}/root.txt`, "base\n", "utf8");
	runGitText(["add", "root.txt"], superSourceRoot);
	runGitText(["commit", "-m", "base"], superSourceRoot);
	await writeFile(`${superSourceRoot}/root.txt`, "history\n", "utf8");
	runGitText(["add", "root.txt"], superSourceRoot);
	runGitText(["commit", "-m", "history"], superSourceRoot);
	runGitText(
		[
			"-c",
			"protocol.file.allow=always",
			"submodule",
			"add",
			"-q",
			pathToFileURL(submoduleBareRoot).toString(),
			"modules/lib",
		],
		superSourceRoot,
	);
	runGitText(["commit", "-am", "add-submodule"], superSourceRoot);
	const defaultBranch = runGitText(
		["symbolic-ref", "--short", "HEAD"],
		superSourceRoot,
	);

	const featureBranch = "feature-net";
	runGitText(["checkout", "-b", featureBranch], superSourceRoot);
	await writeFile(`${superSourceRoot}/root.txt`, "feature-net\n", "utf8");
	runGitText(["add", "root.txt"], superSourceRoot);
	runGitText(["commit", "-m", "feature-net"], superSourceRoot);
	const featureOid = runGitText(["rev-parse", "HEAD"], superSourceRoot);
	runGitText(["checkout", defaultBranch], superSourceRoot);

	runGitText(
		["clone", "--quiet", "--bare", superSourceRoot, superBareRoot],
		superSourceRoot,
	);
	runGitText(["config", "uploadpack.allowFilter", "true"], superBareRoot);
	runGitText(
		["config", "uploadpack.allowAnySHA1InWant", "true"],
		superBareRoot,
	);

	return {
		submoduleSourceRoot,
		submoduleBareRoot,
		superSourceRoot,
		superBareRoot,
		featureBranch,
		featureOid,
	};
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

test("clone file remote supports depth filter and recurse-submodules parity INV-FEAT-0053", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const submoduleSourceRoot = await mkdtemp(
		path.join(os.tmpdir(), "repo-clone-submodule-source-"),
	);
	const submoduleBareRoot = await mkdtemp(
		path.join(os.tmpdir(), "repo-clone-submodule-bare-"),
	);
	const superSourceRoot = await mkdtemp(
		path.join(os.tmpdir(), "repo-clone-super-source-"),
	);
	const superBareRoot = await mkdtemp(
		path.join(os.tmpdir(), "repo-clone-super-bare-"),
	);
	const targetRoot = await mkdtemp(
		path.join(os.tmpdir(), "repo-clone-remote-target-"),
	);
	const baselineRoot = await mkdtemp(
		path.join(os.tmpdir(), "repo-clone-remote-baseline-"),
	);
	context.after(async () => {
		await rm(submoduleSourceRoot, { recursive: true, force: true });
		await rm(submoduleBareRoot, { recursive: true, force: true });
		await rm(superSourceRoot, { recursive: true, force: true });
		await rm(superBareRoot, { recursive: true, force: true });
		await rm(targetRoot, { recursive: true, force: true });
		await rm(baselineRoot, { recursive: true, force: true });
	});

	runGitText(["init", "--quiet"], submoduleSourceRoot);
	await writeFile(`${submoduleSourceRoot}/sub.txt`, "submodule\n", "utf8");
	runGitText(["add", "sub.txt"], submoduleSourceRoot);
	runGitText(["commit", "-m", "submodule-base"], submoduleSourceRoot);
	runGitText(
		["clone", "--quiet", "--bare", submoduleSourceRoot, submoduleBareRoot],
		submoduleSourceRoot,
	);

	runGitText(["init", "--quiet"], superSourceRoot);
	await writeFile(`${superSourceRoot}/root.txt`, "base\n", "utf8");
	runGitText(["add", "root.txt"], superSourceRoot);
	runGitText(["commit", "-m", "base"], superSourceRoot);
	await writeFile(`${superSourceRoot}/root.txt`, "history\n", "utf8");
	runGitText(["add", "root.txt"], superSourceRoot);
	runGitText(["commit", "-m", "history"], superSourceRoot);
	runGitText(
		[
			"-c",
			"protocol.file.allow=always",
			"submodule",
			"add",
			"-q",
			pathToFileURL(submoduleBareRoot).toString(),
			"modules/lib",
		],
		superSourceRoot,
	);
	runGitText(["commit", "-am", "add-submodule"], superSourceRoot);

	runGitText(
		["clone", "--quiet", "--bare", superSourceRoot, superBareRoot],
		superSourceRoot,
	);
	runGitText(["config", "uploadpack.allowFilter", "true"], superBareRoot);
	runGitText(
		["config", "uploadpack.allowAnySHA1InWant", "true"],
		superBareRoot,
	);

	const remoteUrl = pathToFileURL(superBareRoot).toString();
	const cloned = await Repo.clone(remoteUrl, targetRoot, {
		depth: 1,
		filter: "blob:none",
		recurseSubmodules: true,
	});
	assert.equal(cloned.worktreePath, targetRoot);
	assert.equal(runGitText(["rev-list", "--count", "HEAD"], targetRoot), "1");
	const partialCloneState = JSON.parse(
		await readFile(`${targetRoot}/.git/partial-clone-codex.json`, "utf8"),
	);
	assert.equal(partialCloneState.filterSpec, "blob:none");
	assert.equal(
		runGitText(["config", "--get", "remote.origin.url"], targetRoot),
		remoteUrl,
	);
	assert.equal(
		await readFile(`${targetRoot}/modules/lib/sub.txt`, "utf8"),
		"submodule\n",
	);
	runGitText(["fsck", "--full"], targetRoot);

	runGitText(
		[
			"-c",
			"protocol.file.allow=always",
			"clone",
			"--quiet",
			"--depth",
			"1",
			"--filter=blob:none",
			"--recurse-submodules",
			remoteUrl,
			baselineRoot,
		],
		superSourceRoot,
	);
	assert.equal(
		runGitText(["rev-parse", "HEAD"], targetRoot),
		runGitText(["rev-parse", "HEAD"], baselineRoot),
	);
	assert.equal(
		runGitText(["rev-list", "--count", "HEAD"], targetRoot),
		runGitText(["rev-list", "--count", "HEAD"], baselineRoot),
	);
	assert.equal(
		await readFile(`${targetRoot}/modules/lib/sub.txt`, "utf8"),
		await readFile(`${baselineRoot}/modules/lib/sub.txt`, "utf8"),
	);
});

test("clone http remote supports branch depth filter and recurse-submodules parity INV-FEAT-0053", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const fixture = await createCloneNetworkFixture("repo-clone-http");
	const targetRoot = await mkdtemp(
		path.join(os.tmpdir(), "repo-clone-http-target-"),
	);
	const baselineRoot = await mkdtemp(
		path.join(os.tmpdir(), "repo-clone-http-baseline-"),
	);

	const server = createServer((req, res) => {
		const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
		const isUploadPackDiscovery =
			req.method === "GET" &&
			requestUrl.pathname.endsWith("/info/refs") &&
			requestUrl.searchParams.get("service") === "git-upload-pack";
		if (!isUploadPackDiscovery) {
			res.statusCode = 404;
			res.end("not-found");
			return;
		}
		res.statusCode = 200;
		res.setHeader("x-codex-repo-path", fixture.superBareRoot);
		res.end("upload-pack-discovery-ok");
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

	context.after(async () => {
		server.close();
		await rm(fixture.submoduleSourceRoot, { recursive: true, force: true });
		await rm(fixture.submoduleBareRoot, { recursive: true, force: true });
		await rm(fixture.superSourceRoot, { recursive: true, force: true });
		await rm(fixture.superBareRoot, { recursive: true, force: true });
		await rm(targetRoot, { recursive: true, force: true });
		await rm(baselineRoot, { recursive: true, force: true });
	});

	const address = server.address();
	const port = typeof address === "object" && address ? address.port : 0;
	const remoteUrl = `http://127.0.0.1:${port}/network.git`;
	const progressEvents = [];
	const cloned = await Repo.clone(remoteUrl, targetRoot, {
		branch: fixture.featureBranch,
		depth: 1,
		filter: "blob:none",
		recurseSubmodules: true,
		onProgress: (event) => progressEvents.push(event),
	});
	assert.equal(cloned.worktreePath, targetRoot);
	assert.equal(
		runGitText(["rev-parse", "HEAD"], targetRoot),
		fixture.featureOid,
	);
	assert.equal(runGitText(["rev-list", "--count", "HEAD"], targetRoot), "1");
	const partialCloneState = JSON.parse(
		await readFile(`${targetRoot}/.git/partial-clone-codex.json`, "utf8"),
	);
	assert.equal(partialCloneState.filterSpec, "blob:none");
	assert.equal(
		runGitText(["config", "--get", "remote.origin.url"], targetRoot),
		remoteUrl,
	);
	assert.equal(
		await readFile(`${targetRoot}/modules/lib/sub.txt`, "utf8"),
		"submodule\n",
	);
	assert.ok(progressEvents.some((event) => event.phase === "fetch"));
	assert.ok(
		progressEvents.some((event) =>
			String(event.message || "").includes("service=git-upload-pack"),
		),
	);
	runGitText(["fsck", "--full"], targetRoot);

	runGitText(
		[
			"-c",
			"protocol.file.allow=always",
			"clone",
			"--quiet",
			"--branch",
			fixture.featureBranch,
			"--depth",
			"1",
			"--filter=blob:none",
			"--recurse-submodules",
			pathToFileURL(fixture.superBareRoot).toString(),
			baselineRoot,
		],
		fixture.superSourceRoot,
	);
	assert.equal(
		runGitText(["rev-parse", "HEAD"], targetRoot),
		runGitText(["rev-parse", "HEAD"], baselineRoot),
	);
	assert.equal(
		runGitText(["rev-list", "--count", "HEAD"], targetRoot),
		runGitText(["rev-list", "--count", "HEAD"], baselineRoot),
	);
	assert.equal(
		await readFile(`${targetRoot}/modules/lib/sub.txt`, "utf8"),
		await readFile(`${baselineRoot}/modules/lib/sub.txt`, "utf8"),
	);
});

test("clone ssh remote supports branch depth filter and recurse-submodules parity INV-FEAT-0053", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const fixture = await createCloneNetworkFixture("repo-clone-ssh");
	const targetRoot = await mkdtemp(
		path.join(os.tmpdir(), "repo-clone-ssh-target-"),
	);
	const baselineRoot = await mkdtemp(
		path.join(os.tmpdir(), "repo-clone-ssh-baseline-"),
	);
	context.after(async () => {
		await rm(fixture.submoduleSourceRoot, { recursive: true, force: true });
		await rm(fixture.submoduleBareRoot, { recursive: true, force: true });
		await rm(fixture.superSourceRoot, { recursive: true, force: true });
		await rm(fixture.superBareRoot, { recursive: true, force: true });
		await rm(targetRoot, { recursive: true, force: true });
		await rm(baselineRoot, { recursive: true, force: true });
	});

	const remoteUrl = `ssh://127.0.0.1${pathToFileURL(fixture.superBareRoot).pathname}`;
	const secret = "ssh-clone-secret";
	const progressEvents = [];
	const credentialPort = {
		async get(url) {
			return {
				username: "robot",
				secret,
				url,
			};
		},
	};
	const cloned = await Repo.clone(remoteUrl, targetRoot, {
		branch: fixture.featureBranch,
		depth: 1,
		filter: "blob:none",
		recurseSubmodules: true,
		credentialPort,
		onProgress: (event) => progressEvents.push(event),
	});
	assert.equal(cloned.worktreePath, targetRoot);
	assert.equal(
		runGitText(["rev-parse", "HEAD"], targetRoot),
		fixture.featureOid,
	);
	assert.equal(runGitText(["rev-list", "--count", "HEAD"], targetRoot), "1");
	const partialCloneState = JSON.parse(
		await readFile(`${targetRoot}/.git/partial-clone-codex.json`, "utf8"),
	);
	assert.equal(partialCloneState.filterSpec, "blob:none");
	assert.equal(
		runGitText(["config", "--get", "remote.origin.url"], targetRoot),
		remoteUrl,
	);
	assert.equal(
		await readFile(`${targetRoot}/modules/lib/sub.txt`, "utf8"),
		"submodule\n",
	);
	assert.ok(
		progressEvents.some((event) =>
			String(event.message || "").includes("upload-pack"),
		),
	);
	assert.ok(
		progressEvents.every(
			(event) => !String(event.message || "").includes(secret),
		),
	);
	runGitText(["fsck", "--full"], targetRoot);

	runGitText(
		[
			"-c",
			"protocol.file.allow=always",
			"clone",
			"--quiet",
			"--branch",
			fixture.featureBranch,
			"--depth",
			"1",
			"--filter=blob:none",
			"--recurse-submodules",
			pathToFileURL(fixture.superBareRoot).toString(),
			baselineRoot,
		],
		fixture.superSourceRoot,
	);
	assert.equal(
		runGitText(["rev-parse", "HEAD"], targetRoot),
		runGitText(["rev-parse", "HEAD"], baselineRoot),
	);
	assert.equal(
		runGitText(["rev-list", "--count", "HEAD"], targetRoot),
		runGitText(["rev-list", "--count", "HEAD"], baselineRoot),
	);
	assert.equal(
		await readFile(`${targetRoot}/modules/lib/sub.txt`, "utf8"),
		await readFile(`${baselineRoot}/modules/lib/sub.txt`, "utf8"),
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
