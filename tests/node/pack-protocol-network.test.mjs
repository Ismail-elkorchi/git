import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
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

test("pkt-line parser enforces length limits INV-SECU-0005 INV-SECU-0009", async () => {
	const { makePktLine, parsePktLine } = await import(
		"../../dist/core/protocol/pkt-line.js"
	);
	const okFrame = makePktLine(new TextEncoder().encode("abcd"));
	const okPayload = parsePktLine(okFrame);
	assert.equal(new TextDecoder().decode(okPayload), "abcd");

	const tooLargeData = new TextEncoder().encode("fff1");
	assert.throws(
		() => parsePktLine(tooLargeData),
		/data length limit|total length limit/i,
	);
});

test("smart-http discovery validation enforces query rules INV-FEAT-0020 INV-SECU-0010", async () => {
	const { parseSmartHttpDiscoveryUrl } = await import(
		"../../dist/core/network/discovery.js"
	);

	assert.throws(
		() =>
			parseSmartHttpDiscoveryUrl(
				"http://127.0.0.1/repo.git/info/refs?service=git-upload-pack&x=1",
			),
		/exactly one query parameter/i,
	);

	assert.throws(
		() => parseSmartHttpDiscoveryUrl("http://127.0.0.1/repo.git/info/refs"),
		/service query parameter/i,
	);
});

test("Repo.fetchHttp and Repo.pushHttp use local fixture and report progress INV-FEAT-0021 INV-FEAT-0022 INV-OPER-0001", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const root = await mkdtemp(path.join(os.tmpdir(), "repo-network-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});
	const repo = await Repo.init(root, { hashAlgorithm: "sha1" });

	const server = createServer((req, res) => {
		if (req.method === "GET") {
			res.statusCode = 200;
			res.end("fetch-response");
			return;
		}
		if (req.method === "POST") {
			const chunks = [];
			req.on("data", (chunk) => chunks.push(chunk));
			req.on("end", () => {
				const joined = Buffer.concat(chunks);
				res.statusCode = 200;
				res.end(`push-received:${joined.byteLength}`);
			});
			return;
		}
		res.statusCode = 405;
		res.end("method-not-allowed");
	});

	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	context.after(() => {
		server.close();
	});
	const address = server.address();
	const port = typeof address === "object" && address ? address.port : 0;
	const fetchUrl = `http://127.0.0.1:${port}/repo.git/info/refs?service=git-upload-pack`;
	const pushUrl = `http://127.0.0.1:${port}/repo.git/info/refs?service=git-receive-pack`;

	const events = [];
	const fetchPayload = await repo.fetchHttp(fetchUrl, (event) =>
		events.push(event),
	);
	assert.equal(new TextDecoder().decode(fetchPayload), "fetch-response");

	const pushPayload = await repo.pushHttp(pushUrl, "payload-x", (event) =>
		events.push(event),
	);
	assert.equal(new TextDecoder().decode(pushPayload), "push-received:9");
	assert.ok(events.some((event) => event.phase === "fetch"));
	assert.ok(events.some((event) => event.phase === "push"));
});

test("Repo.writePackBundle and Repo.readObjectFromPack integrate with git verify-pack INV-FEAT-0009 INV-FEAT-0010 INV-SECU-0008", async (context) => {
	const { Repo } = await import("../../dist/index.js");
	const { DEFAULT_MAX_DELTA_CHAIN_DEPTH } = await import(
		"../../dist/core/compress/limits.js"
	);
	assert.equal(DEFAULT_MAX_DELTA_CHAIN_DEPTH, 50);

	const root = await mkdtemp(path.join(os.tmpdir(), "repo-pack-"));
	context.after(async () => {
		await rm(root, { recursive: true, force: true });
	});

	runGitText(["init", "--quiet"], root);
	await writeFile(`${root}/seed.txt`, "seed\n", "utf8");
	runGitText(["add", "seed.txt"], root);
	runGitText(["commit", "-m", "seed"], root);
	runGitText(["gc", "--aggressive", "--prune=now"], root);

	const packDir = `${root}/.git/objects/pack`;
	const names = await readdir(packDir);
	const packName = names.find((name) => name.endsWith(".pack"));
	const idxName = names.find((name) => name.endsWith(".idx"));
	if (!packName || !idxName) throw new Error("pack fixture missing");

	const sourcePack = new Uint8Array(await readFile(`${packDir}/${packName}`));
	const sourceIdx = new Uint8Array(await readFile(`${packDir}/${idxName}`));
	const repo = await Repo.open(root);
	const copy = await repo.writePackBundle("copy-x", sourcePack, sourceIdx);
	runGitText(["verify-pack", "-v", copy.idxPath], root);

	const oid = await repo.writeBlob("pack-reader\n");
	const readBytes = await repo.readObjectFromPack(
		oid,
		copy.packPath,
		copy.idxPath,
	);
	assert.equal(new TextDecoder().decode(readBytes), "pack-reader\n");
});
