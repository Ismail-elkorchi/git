import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("configuration precedence follows Git scope order INV-FEAT-0027", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-config-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});

	const repo = await Repo.init(root, { hashAlgorithm: "sha1" });
	const resolved = repo.resolveConfig([
		{ scope: "worktree", values: { "user.name": "worktree-user" } },
		{
			scope: "global",
			values: { "user.name": "global-user", "core.editor": "vi" },
		},
		{ scope: "local", values: { "user.name": "local-user" } },
		{ scope: "system", values: { "user.name": "system-user" } },
	]);

	assert.equal(resolved["user.name"], "worktree-user");
	assert.equal(resolved["core.editor"], "vi");
});

test("hook policy executes deterministic invocation INV-FEAT-0028", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-hooks-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});

	const repo = await Repo.init(root, { hashAlgorithm: "sha1" });
	const seen = [];
	const hookPort = {
		async execute(invocation) {
			seen.push(invocation);
			return { exitCode: 0, stdout: "ok", stderr: "" };
		},
	};

	const result = await repo.runHookPolicy(
		hookPort,
		"pre-commit",
		["a", "b"],
		"stdin-data",
		{ Z: "z", A: "a" },
	);
	assert.equal(result.exitCode, 0);
	assert.deepEqual(seen[0]?.argv, ["a", "b"]);
	assert.deepEqual(seen[0]?.env, { A: "a", Z: "z" });
});

test("ssh fetch and push use credential port and redact progress secrets INV-FEAT-0025 INV-FEAT-0026 INV-SECU-0013", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-ssh-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});

	const repo = await Repo.init(root, { hashAlgorithm: "sha1" });
	const secret = "s3cr3t-token";
	const credentialPort = {
		async get(url) {
			return {
				username: "robot",
				secret,
				url,
			};
		},
	};

	const events = [];
	const oid = await repo.fetchSsh(
		"ssh://127.0.0.1/repo.git",
		credentialPort,
		(event) => events.push(event),
	);
	const bytes = await repo.readObject(oid);
	assert.ok(new TextDecoder().decode(bytes).includes("upload-pack"));

	const pushResult = await repo.pushSsh(
		"ssh://127.0.0.1/repo.git",
		"refs/heads/main:refs/heads/main",
		credentialPort,
		(event) => events.push(event),
	);
	assert.equal(pushResult.refspec, "refs/heads/main:refs/heads/main");
	assert.ok(
		events.some((event) => String(event.message || "").includes("upload-pack")),
	);
	assert.ok(
		events.some((event) =>
			String(event.message || "").includes("receive-pack"),
		),
	);
	assert.ok(
		events.every((event) => !String(event.message || "").includes(secret)),
	);
});
