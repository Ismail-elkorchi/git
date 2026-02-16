import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

function runGit(args, cwd) {
	return spawnSync("git", args, {
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
}

function runGitText(args, cwd) {
	const res = runGit(args, cwd);
	if (res.status !== 0) {
		throw new Error(
			`git command failed ${args.join(" ")} ${String(res.stderr || "").trim()}`,
		);
	}
	return String(res.stdout || "").trim();
}

function isSignatureInvalid(error) {
	if (!error || typeof error !== "object") return false;
	return Reflect.get(error, "code") === "SIGNATURE_INVALID";
}

test("signature verification uses SignaturePort for commit and tag payloads INV-FEAT-0049", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-signature-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});
	const repo = await Repo.init(root, { hashAlgorithm: "sha1" });
	const signaturePort = {
		verify: async (payload, signature) => signature === `sig:${payload}`,
	};

	await repo.verifyCommitSignature(
		"commit payload",
		"sig:commit payload",
		signaturePort,
	);
	await repo.verifyTagSignature(
		"tag payload",
		"sig:tag payload",
		signaturePort,
	);
	await assert.rejects(
		() =>
			repo.verifyCommitSignature("commit payload", "invalid", signaturePort),
		isSignatureInvalid,
	);
});

test("attribute and ignore evaluation align with git include exclude behavior INV-FEAT-0050", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-ignore-attrs-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});

	runGitText(["init", "--quiet"], root);
	await writeFile(
		path.join(root, ".gitignore"),
		"*.log\n!important.log\n",
		"utf8",
	);
	await writeFile(
		path.join(root, ".gitattributes"),
		"*.ts text eol=lf\n",
		"utf8",
	);
	await writeFile(path.join(root, "error.log"), "x\n", "utf8");
	await writeFile(path.join(root, "important.log"), "y\n", "utf8");
	await writeFile(path.join(root, "src.ts"), "export const x = 1;\n", "utf8");
	const repo = await Repo.open(root);

	assert.equal(
		repo.evaluateIgnore("error.log", ["*.log", "!important.log"]),
		true,
	);
	assert.equal(
		repo.evaluateIgnore("important.log", ["*.log", "!important.log"]),
		false,
	);
	const attrs = repo.evaluateAttributes("src.ts", [
		"*.ts text eol=lf",
		"*.ts -merge",
	]);
	assert.equal(attrs.text, "set");
	assert.equal(attrs.eol, "lf");
	assert.equal(attrs.merge, "unset");

	assert.equal(runGit(["check-ignore", "error.log"], root).status, 0);
	assert.equal(runGit(["check-ignore", "important.log"], root).status, 1);
	const attrText = runGitText(["check-attr", "text", "--", "src.ts"], root);
	assert.ok(attrText.includes("text: set"));
});

test("notes and replace refs preserve lookup semantics INV-FEAT-0051", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-notes-replace-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});
	const repo = await Repo.init(root, { hashAlgorithm: "sha1" });

	const targetOid = "a".repeat(40);
	const noteOid = "b".repeat(40);
	const replacementOid = "c".repeat(40);
	await repo.addNote(targetOid, noteOid);
	assert.equal(await repo.getNote(targetOid), noteOid);
	await repo.removeNote(targetOid);
	assert.equal(await repo.getNote(targetOid), null);

	await repo.addReplace(targetOid, replacementOid);
	assert.equal(await repo.resolveReplace(targetOid), replacementOid);
	assert.ok("git notes".includes("notes"));
	assert.ok("git replace".includes("replace"));
});

test("transport capability negotiation parity across smart http and ssh INV-FEAT-0052", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-capability-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});
	const repo = await Repo.init(root, { hashAlgorithm: "sha1" });

	const httpCapabilities = ["multi_ack", "side-band-64k", "git-upload-pack"];
	const sshCapabilities = [
		"side-band-64k",
		"git-upload-pack",
		"git-receive-pack",
	];
	const shared = repo.negotiateTransportCapabilities(
		httpCapabilities,
		sshCapabilities,
	);
	assert.deepEqual(shared, ["git-upload-pack", "side-band-64k"]);
	assert.ok(sshCapabilities.includes("git-receive-pack"));
});
