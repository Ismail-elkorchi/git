import { WebCompressionAdapter } from "./adapters/web-compression.js";
import { hashGitObject } from "./core/crypto/hash.js";
import {
	decodeLooseObject,
	encodeLooseObject,
	type GitObjectType,
} from "./core/objects/loose.js";
import {
	formatReflogEntry,
	normalizeRefName,
	parsePackedRefs,
} from "./core/refs/refs.js";
import { buildRepoConfig, parseRepoObjectFormat } from "./core/repo/config.js";
import type { CompressionPort } from "./ports/compression.js";

export type GitHashAlgorithm = "sha1" | "sha256";

export type GitErrorCode =
	| "INVALID_ARGUMENT"
	| "NOT_FOUND"
	| "ALREADY_EXISTS"
	| "PERMISSION_DENIED"
	| "IO_ERROR"
	| "LOCK_CONFLICT"
	| "OBJECT_FORMAT_ERROR"
	| "PACK_FORMAT_ERROR"
	| "PROTO_ERROR"
	| "UNSUPPORTED"
	| "INTEGRITY_ERROR"
	| "NETWORK_ERROR"
	| "TIMEOUT"
	| "CANCELLED"
	| "AUTH_REQUIRED"
	| "AUTH_REJECTED"
	| "MERGE_CONFLICT"
	| "REBASE_CONFLICT"
	| "SIGNATURE_INVALID";

export class GitError extends Error {
	public readonly code: GitErrorCode;
	public readonly details: unknown;

	public constructor(message: string, code: GitErrorCode, details: unknown) {
		super(message);
		this.name = "GitError";
		this.code = code;
		this.details = details;
	}
}

type NodeFsPromises = {
	mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
	appendFile(
		path: string,
		data: string,
		options?: { encoding?: string },
	): Promise<void>;
	writeFile(
		path: string,
		data: string | Uint8Array,
		options?: { encoding?: string },
	): Promise<void>;
	readFile(
		path: string,
		options?: { encoding?: string },
	): Promise<string | Uint8Array>;
	stat(path: string): Promise<{ isDirectory(): boolean }>;
};

const textEncoder = new TextEncoder();
const nodeFsPromisesModuleId: string = "node:fs/promises";

function toBytes(payload: Uint8Array | string): Uint8Array {
	if (typeof payload === "string") return textEncoder.encode(payload);
	return payload;
}

function stripTrailingSlash(pathValue: string): string {
	if (pathValue === "/") return pathValue;
	return pathValue.replace(/\/+$/, "");
}

function joinFsPath(base: string, ...parts: string[]): string {
	let out = stripTrailingSlash(base);
	for (const part of parts) {
		const normalized = part.replace(/^\/+/, "").replace(/\/+$/, "");
		if (normalized.length === 0) continue;
		out = out.length === 0 ? normalized : `${out}/${normalized}`;
	}
	return out;
}

function parentFsPath(pathValue: string): string {
	const idx = pathValue.lastIndexOf("/");
	if (idx <= 0) return "/";
	return pathValue.slice(0, idx);
}

function objectPathParts(oid: string): { dir: string; file: string } {
	if (!/^[0-9a-f]{40}$|^[0-9a-f]{64}$/.test(oid)) {
		throw new GitError("invalid object id", "INVALID_ARGUMENT", { oid });
	}
	return { dir: oid.slice(0, 2), file: oid.slice(2) };
}

function isObjectId(value: string): boolean {
	return /^[0-9a-f]{40}$|^[0-9a-f]{64}$/.test(value);
}

async function loadNodeFs(): Promise<NodeFsPromises> {
	return (await import(nodeFsPromisesModuleId)) as NodeFsPromises;
}

async function pathExists(
	fs: NodeFsPromises,
	pathValue: string,
): Promise<boolean> {
	const st = await fs.stat(pathValue).catch(() => null);
	return st !== null;
}

interface RepoInitOptions {
	hashAlgorithm?: GitHashAlgorithm;
}

export class Repo {
	public readonly gitDirPath: string;
	public readonly worktreePath: string | null;
	public readonly hashAlgorithm: GitHashAlgorithm;
	private readonly compression: CompressionPort;

	public constructor(
		gitDirPath: string,
		worktreePath: string | null = null,
		hashAlgorithm: GitHashAlgorithm = "sha1",
		compression: CompressionPort = new WebCompressionAdapter(),
	) {
		this.gitDirPath = stripTrailingSlash(gitDirPath);
		this.worktreePath = worktreePath;
		this.hashAlgorithm = hashAlgorithm;
		this.compression = compression;
	}

	public static async init(
		worktreePath: string,
		options: RepoInitOptions = {},
	): Promise<Repo> {
		const hashAlgorithm = options.hashAlgorithm ?? "sha1";
		const fs = await loadNodeFs();
		const normalizedWorktree = stripTrailingSlash(worktreePath);
		const gitDirPath = joinFsPath(normalizedWorktree, ".git");

		await fs.mkdir(normalizedWorktree, { recursive: true });
		await fs.mkdir(joinFsPath(gitDirPath, "branches"), { recursive: true });
		await fs.mkdir(joinFsPath(gitDirPath, "hooks"), { recursive: true });
		await fs.mkdir(joinFsPath(gitDirPath, "info"), { recursive: true });
		await fs.mkdir(joinFsPath(gitDirPath, "objects", "info"), {
			recursive: true,
		});
		await fs.mkdir(joinFsPath(gitDirPath, "objects", "pack"), {
			recursive: true,
		});
		await fs.mkdir(joinFsPath(gitDirPath, "refs", "heads"), {
			recursive: true,
		});
		await fs.mkdir(joinFsPath(gitDirPath, "refs", "tags"), { recursive: true });
		await fs.mkdir(joinFsPath(gitDirPath, "logs", "refs", "heads"), {
			recursive: true,
		});
		await fs.mkdir(joinFsPath(gitDirPath, "logs", "refs", "tags"), {
			recursive: true,
		});

		await fs.writeFile(
			joinFsPath(gitDirPath, "HEAD"),
			"ref: refs/heads/main\n",
			{
				encoding: "utf8",
			},
		);
		await fs.writeFile(
			joinFsPath(gitDirPath, "description"),
			"Unnamed repository\n",
			{
				encoding: "utf8",
			},
		);
		await fs.writeFile(
			joinFsPath(gitDirPath, "config"),
			buildRepoConfig(hashAlgorithm),
			{
				encoding: "utf8",
			},
		);

		return new Repo(gitDirPath, normalizedWorktree, hashAlgorithm);
	}

	public static async open(repoPath: string): Promise<Repo> {
		const fs = await loadNodeFs();
		const normalizedPath = stripTrailingSlash(repoPath);
		const gitDirCandidate = joinFsPath(normalizedPath, ".git");
		const gitDirExists = await pathExists(fs, gitDirCandidate);
		const gitDirPath = gitDirExists ? gitDirCandidate : normalizedPath;

		const objectsPath = joinFsPath(gitDirPath, "objects");
		const refsPath = joinFsPath(gitDirPath, "refs");
		const configPath = joinFsPath(gitDirPath, "config");
		const [objectsExists, refsExists, configExists] = await Promise.all([
			pathExists(fs, objectsPath),
			pathExists(fs, refsPath),
			pathExists(fs, configPath),
		]);

		if (!objectsExists || !refsExists || !configExists) {
			throw new GitError("repository paths missing", "NOT_FOUND", {
				gitDirPath,
			});
		}

		const configText = String(
			await fs.readFile(configPath, {
				encoding: "utf8",
			}),
		);
		const hashAlgorithm = parseRepoObjectFormat(configText);
		const worktreePath = gitDirExists ? normalizedPath : null;
		return new Repo(gitDirPath, worktreePath, hashAlgorithm);
	}

	private async writeLooseObject(
		objectType: GitObjectType,
		payload: Uint8Array,
	): Promise<string> {
		const fs = await loadNodeFs();
		const oid = await hashGitObject(objectType, payload, this.hashAlgorithm);
		const compressed = await this.compression.deflateRaw(
			encodeLooseObject(objectType, payload),
		);
		const { dir, file } = objectPathParts(oid);
		const objectDir = joinFsPath(this.gitDirPath, "objects", dir);
		const objectPath = joinFsPath(objectDir, file);

		await fs.mkdir(objectDir, { recursive: true });
		const exists = await pathExists(fs, objectPath);
		if (!exists) await fs.writeFile(objectPath, compressed);
		return oid;
	}

	public async writeBlob(payload: Uint8Array | string): Promise<string> {
		return this.writeLooseObject("blob", toBytes(payload));
	}

	public async writeTree(payload: Uint8Array | string): Promise<string> {
		return this.writeLooseObject("tree", toBytes(payload));
	}

	public async writeCommit(payload: Uint8Array | string): Promise<string> {
		return this.writeLooseObject("commit", toBytes(payload));
	}

	public async readObject(oid: string): Promise<Uint8Array> {
		const fs = await loadNodeFs();
		const { dir, file } = objectPathParts(oid);
		const objectPath = joinFsPath(this.gitDirPath, "objects", dir, file);
		const objectBytes = await fs.readFile(objectPath);
		if (!(objectBytes instanceof Uint8Array)) {
			throw new GitError("invalid object bytes", "OBJECT_FORMAT_ERROR", {
				oid,
			});
		}

		const inflated = await this.compression.inflateRaw(objectBytes);
		const decoded = decodeLooseObject(inflated);
		return decoded.payload;
	}

	public async resolveRef(refName: string): Promise<string | null> {
		const fs = await loadNodeFs();
		const normalizedRef = normalizeRefName(refName);
		const loosePath = joinFsPath(this.gitDirPath, normalizedRef);
		const looseExists = await pathExists(fs, loosePath);
		if (looseExists) {
			const looseValue = String(
				await fs.readFile(loosePath, {
					encoding: "utf8",
				}),
			).trim();
			if (isObjectId(looseValue)) return looseValue;
		}

		const packedRefsPath = joinFsPath(this.gitDirPath, "packed-refs");
		const packedExists = await pathExists(fs, packedRefsPath);
		if (!packedExists) return null;
		const packedText = String(
			await fs.readFile(packedRefsPath, {
				encoding: "utf8",
			}),
		);
		return parsePackedRefs(packedText).get(normalizedRef) ?? null;
	}

	public async resolveHead(): Promise<string> {
		const fs = await loadNodeFs();
		const headPath = joinFsPath(this.gitDirPath, "HEAD");
		const headValue = String(
			await fs.readFile(headPath, {
				encoding: "utf8",
			}),
		).trim();

		if (headValue.startsWith("ref:")) {
			const headRef = normalizeRefName(headValue.slice("ref:".length).trim());
			const oid = await this.resolveRef(headRef);
			if (oid === null) {
				throw new GitError("head reference not found", "NOT_FOUND", {
					headRef,
				});
			}
			return oid;
		}

		if (!isObjectId(headValue)) {
			throw new GitError("head value invalid", "OBJECT_FORMAT_ERROR", {
				headValue,
			});
		}

		return headValue;
	}

	public async updateRef(
		refName: string,
		oid: string,
		message = "update-ref",
	): Promise<void> {
		if (!isObjectId(oid)) {
			throw new GitError("invalid object id", "INVALID_ARGUMENT", { oid });
		}

		const fs = await loadNodeFs();
		const normalizedRef = normalizeRefName(refName);
		const oldOid =
			(await this.resolveRef(normalizedRef)) ?? "0".repeat(oid.length);
		const refPath = joinFsPath(this.gitDirPath, normalizedRef);
		await fs.mkdir(parentFsPath(refPath), { recursive: true });
		await fs.writeFile(refPath, `${oid}\n`, { encoding: "utf8" });

		const reflogPath = joinFsPath(this.gitDirPath, "logs", normalizedRef);
		await fs.mkdir(parentFsPath(reflogPath), { recursive: true });
		const reflogEntry = formatReflogEntry(oldOid, oid, message);
		await fs.appendFile(reflogPath, reflogEntry, { encoding: "utf8" });
	}
}
