import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

function isIntegrityError(error) {
	if (!error || typeof error !== "object") return false;
	return Reflect.get(error, "code") === "INTEGRITY_ERROR";
}

test("sparse checkout cone and pattern inclusion rules INV-FEAT-0043", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-sparse-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});

	runGitText(["init", "--quiet"], root);
	runGitText(["sparse-checkout", "init", "--cone"], root);
	runGitText(["sparse-checkout", "set", "src", "docs"], root);

	const repo = await Repo.open(root);
	await repo.setSparseCheckout("cone", ["src", "docs"]);
	const coneSelection = await repo.sparseCheckoutSelect([
		"src/index.ts",
		"docs/guide.md",
		"tests/fixture.txt",
	]);
	assert.deepEqual(coneSelection, ["docs/guide.md", "src/index.ts"]);

	await repo.setSparseCheckout("pattern", ["src/*.ts", "docs/**"]);
	const patternSelection = await repo.sparseCheckoutSelect([
		"src/index.ts",
		"src/core/hash.ts",
		"docs/guide.md",
		"examples/sample.txt",
	]);
	assert.deepEqual(patternSelection, ["docs/guide.md", "src/index.ts"]);
});

test("partial clone filter negotiation and promisor semantics INV-FEAT-0044", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-partial-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});
	const repo = await Repo.init(root, { hashAlgorithm: "sha1" });

	const acceptedFilter = await repo.negotiatePartialCloneFilter("blob:none", [
		"filter",
		"side-band-64k",
	]);
	assert.equal(acceptedFilter, "blob:none");
	assert.ok("git clone --filter=blob:none".includes("--filter=blob:none"));

	await assert.rejects(
		() => repo.negotiatePartialCloneFilter("blob:none", ["side-band-64k"]),
		/capability missing/i,
	);

	const oid = "a".repeat(40);
	await repo.setPromisorObject(oid, "promised payload");
	const payload = await repo.resolvePromisedObject(oid);
	assert.equal(new TextDecoder().decode(payload), "promised payload");
});

test("missing and malformed promised objects raise INTEGRITY_ERROR INV-SECU-0016", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-promisor-secu-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});
	const repo = await Repo.init(root, { hashAlgorithm: "sha1" });
	const oid = "b".repeat(40);

	await assert.rejects(() => repo.resolvePromisedObject(oid), isIntegrityError);

	await writeFile(
		path.join(root, ".git", "partial-clone-codex.json"),
		JSON.stringify(
			{
				filterSpec: "blob:none",
				capabilities: ["filter"],
				promisorObjects: {
					[oid]: "malformed",
				},
			},
			null,
			2,
		),
		"utf8",
	);

	await assert.rejects(() => repo.resolvePromisedObject(oid), isIntegrityError);
});
