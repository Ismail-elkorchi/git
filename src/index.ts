import { WebCompressionAdapter } from "./adapters/web-compression.js";
import { applyUnifiedPatch } from "./core/apply/patch.js";
import {
	evaluateAttributes as evaluateAttributesRules,
	type GitAttributeValue,
} from "./core/attributes/attributes.js";
import {
	assertBitmapBytes,
	normalizePackBaseName,
} from "./core/bitmap/file.js";
import { type BlameTuple, normalizeBlame } from "./core/blame/blame.js";
import { assertSafeWorktreePath } from "./core/checkout/path-safety.js";
import { cherryPickCommitPayload } from "./core/cherry-pick/cherry-pick.js";
import { assertCommitGraphBytes } from "./core/commit-graph/file.js";
import {
	type ConfigScope,
	resolveConfig,
} from "./core/config/resolve-config.js";
import { hashGitObject } from "./core/crypto/hash.js";
import { generateUnifiedPatch } from "./core/diff/unified.js";
import { buildHookInvocation, runHook } from "./core/hooks/run-hook.js";
import { evaluateIgnorePatterns } from "./core/ignore/ignore.js";
import {
	decodeIndexV2,
	encodeIndexV2,
	type GitIndexV2,
} from "./core/index/index-v2.js";
import { buildLogMetadata, type LogMetadata } from "./core/log/log.js";
import {
	maintenanceStages,
	normalizeObjectIds,
} from "./core/maintenance/maintenance.js";
import { computeMergeOutcome, type MergeOutcome } from "./core/merge/merge.js";
import { assertMultiPackIndexBytes } from "./core/multi-pack-index/file.js";
import { parseSmartHttpDiscoveryUrl } from "./core/network/discovery.js";
import {
	buildReceivePackLine,
	buildUploadPackLine,
	redactSecret,
} from "./core/network/ssh.js";
import { dropNote, normalizeNotesState, setNote } from "./core/notes/notes.js";
import {
	decodeLooseObject,
	encodeLooseObject,
	type GitObjectType,
} from "./core/objects/loose.js";
import { packFileNames } from "./core/pack/pack-files.js";
import {
	defaultPartialCloneState,
	negotiatePartialCloneFilter,
	normalizePartialCloneState,
	type PartialCloneState,
} from "./core/partial-clone/promisor.js";
import { negotiateCapabilityParity } from "./core/protocol/capabilities.js";
import {
	abortRebaseState,
	continueRebaseState,
	type RebaseState,
	startRebaseState,
} from "./core/rebase/rebase-state.js";
import {
	formatReflogEntry,
	normalizeRefName,
	parsePackedRefs,
} from "./core/refs/refs.js";
import {
	normalizeRemoteConfig,
	type RemoteConfigEntry,
	upsertRemoteConfig,
} from "./core/remote/remote-config.js";
import { normalizeReplaceState, setReplace } from "./core/replace/replace.js";
import { buildRepoConfig, parseRepoObjectFormat } from "./core/repo/config.js";
import { revertCommitPayload } from "./core/revert/revert.js";
import {
	type CommitNode,
	type WalkMode,
	walkCommits,
} from "./core/revision-walk/walk.js";
import { verifySignedPayload } from "./core/signatures/verify.js";
import {
	normalizeSparseRules,
	type SparseCheckoutMode,
	selectSparsePaths,
} from "./core/sparse-checkout/rules.js";
import {
	addStashEntry,
	dropStashEntry,
	normalizeStash,
	type StashEntry,
} from "./core/stash/stash.js";
import { normalizeStatus, type RepoStatus } from "./core/status/status.js";
import {
	normalizeSubmodules,
	type SubmoduleEntry,
	upsertSubmodule,
} from "./core/submodule/submodule.js";
import {
	type LinkedWorktreeEntry,
	normalizeWorktrees,
	pruneWorktrees,
	upsertWorktree,
} from "./core/worktree/worktree.js";
import type { CompressionPort } from "./ports/compression.js";
import type { CredentialPort } from "./ports/credential.js";
import type { HookPort, HookResult } from "./ports/hook.js";
import type { SignaturePort } from "./ports/signature.js";

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

type ProgressCallback = (value: {
	phase: "fetch" | "push";
	transferredBytes: number;
	totalBytes: number;
	message?: string;
}) => void;

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

	private requireWorktreePath(): string {
		if (this.worktreePath === null) {
			throw new GitError("worktree is required", "UNSUPPORTED", {
				gitDirPath: this.gitDirPath,
			});
		}
		return this.worktreePath;
	}

	private async readIndexV2(fs: NodeFsPromises): Promise<GitIndexV2> {
		const indexPath = joinFsPath(this.gitDirPath, "index");
		const exists = await pathExists(fs, indexPath);
		if (!exists) return { version: 2, entries: [] };
		const rawIndex = await fs.readFile(indexPath);
		if (!(rawIndex instanceof Uint8Array)) {
			throw new GitError("index payload invalid", "OBJECT_FORMAT_ERROR", {
				indexPath,
			});
		}
		return decodeIndexV2(rawIndex);
	}

	private async writeIndexV2(
		fs: NodeFsPromises,
		index: GitIndexV2,
	): Promise<void> {
		const indexPath = joinFsPath(this.gitDirPath, "index");
		await fs.writeFile(indexPath, encodeIndexV2(index));
	}

	private rebaseStatePath(): string {
		return joinFsPath(this.gitDirPath, "rebase-codex", "state.json");
	}

	private stashStatePath(): string {
		return joinFsPath(this.gitDirPath, "stash-codex.json");
	}

	private remoteConfigPath(): string {
		return joinFsPath(this.gitDirPath, "remotes-codex.json");
	}

	private submoduleStatePath(): string {
		return joinFsPath(this.gitDirPath, "submodules-codex.json");
	}

	private worktreeStatePath(): string {
		return joinFsPath(this.gitDirPath, "worktrees-codex.json");
	}

	private sparseCheckoutPath(): string {
		return joinFsPath(this.gitDirPath, "info", "sparse-checkout");
	}

	private sparseCheckoutStatePath(): string {
		return joinFsPath(this.gitDirPath, "info", "sparse-checkout-codex.json");
	}

	private partialCloneStatePath(): string {
		return joinFsPath(this.gitDirPath, "partial-clone-codex.json");
	}

	private maintenanceStatePath(): string {
		return joinFsPath(this.gitDirPath, "maintenance-codex.json");
	}

	private notesStatePath(): string {
		return joinFsPath(this.gitDirPath, "notes-codex.json");
	}

	private replaceStatePath(): string {
		return joinFsPath(this.gitDirPath, "replace-codex.json");
	}

	private async readRebaseState(
		fs: NodeFsPromises,
	): Promise<RebaseState | null> {
		const statePath = this.rebaseStatePath();
		const exists = await pathExists(fs, statePath);
		if (!exists) return null;
		const text = String(
			await fs.readFile(statePath, {
				encoding: "utf8",
			}),
		);
		return JSON.parse(text) as RebaseState;
	}

	private async writeRebaseState(
		fs: NodeFsPromises,
		state: RebaseState,
	): Promise<void> {
		const statePath = this.rebaseStatePath();
		await fs.mkdir(parentFsPath(statePath), { recursive: true });
		await fs.writeFile(statePath, JSON.stringify(state, null, 2), {
			encoding: "utf8",
		});
	}

	private async readSparseCheckoutState(
		fs: NodeFsPromises,
	): Promise<{ mode: SparseCheckoutMode; rules: string[] } | null> {
		const statePath = this.sparseCheckoutStatePath();
		const exists = await pathExists(fs, statePath);
		if (!exists) return null;
		const text = String(
			await fs.readFile(statePath, {
				encoding: "utf8",
			}),
		);
		const parsed = JSON.parse(text) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			throw new GitError(
				"sparse-checkout state malformed",
				"OBJECT_FORMAT_ERROR",
				{
					statePath,
				},
			);
		}

		const record = parsed as Record<string, unknown>;
		const mode = record.mode;
		if (mode !== "cone" && mode !== "pattern") {
			throw new GitError(
				"sparse-checkout mode invalid",
				"OBJECT_FORMAT_ERROR",
				{
					statePath,
				},
			);
		}

		const rawRules = record.rules;
		if (!Array.isArray(rawRules)) {
			throw new GitError(
				"sparse-checkout rules invalid",
				"OBJECT_FORMAT_ERROR",
				{
					statePath,
				},
			);
		}
		const ruleValues = rawRules.filter(
			(item): item is string => typeof item === "string",
		);
		if (ruleValues.length !== rawRules.length) {
			throw new GitError(
				"sparse-checkout rules malformed",
				"OBJECT_FORMAT_ERROR",
				{
					statePath,
				},
			);
		}

		return {
			mode,
			rules: normalizeSparseRules(ruleValues),
		};
	}

	private async writeSparseCheckoutState(
		fs: NodeFsPromises,
		mode: SparseCheckoutMode,
		rules: string[],
	): Promise<void> {
		const normalizedRules = normalizeSparseRules(rules);
		const statePath = this.sparseCheckoutStatePath();
		await fs.mkdir(parentFsPath(statePath), { recursive: true });
		await fs.writeFile(
			statePath,
			JSON.stringify(
				{
					mode,
					rules: normalizedRules,
				},
				null,
				2,
			),
			{
				encoding: "utf8",
			},
		);
		await fs.writeFile(
			this.sparseCheckoutPath(),
			`${normalizedRules.join("\n")}\n`,
			{
				encoding: "utf8",
			},
		);
	}

	private async readPartialCloneState(
		fs: NodeFsPromises,
	): Promise<PartialCloneState> {
		const statePath = this.partialCloneStatePath();
		const exists = await pathExists(fs, statePath);
		if (!exists) {
			return {
				filterSpec: defaultPartialCloneState.filterSpec,
				capabilities: [...defaultPartialCloneState.capabilities],
				promisorObjects: { ...defaultPartialCloneState.promisorObjects },
			};
		}
		const text = String(
			await fs.readFile(statePath, {
				encoding: "utf8",
			}),
		);
		const parsed = JSON.parse(text) as unknown;
		const normalized = normalizePartialCloneState(parsed);
		if (!normalized) {
			throw new GitError("partial clone state malformed", "INTEGRITY_ERROR", {
				statePath,
			});
		}
		return normalized;
	}

	private async writePartialCloneState(
		fs: NodeFsPromises,
		state: PartialCloneState,
	): Promise<void> {
		const statePath = this.partialCloneStatePath();
		await fs.writeFile(statePath, JSON.stringify(state, null, 2), {
			encoding: "utf8",
		});
	}

	private async readStashEntries(fs: NodeFsPromises): Promise<StashEntry[]> {
		const stashPath = this.stashStatePath();
		const exists = await pathExists(fs, stashPath);
		if (!exists) return [];
		const text = String(
			await fs.readFile(stashPath, {
				encoding: "utf8",
			}),
		);
		const parsed = JSON.parse(text);
		if (!Array.isArray(parsed)) return [];
		const out: StashEntry[] = [];
		for (const item of parsed) {
			if (!item || typeof item !== "object") continue;
			if (typeof item.id !== "string") continue;
			if (typeof item.message !== "string") continue;
			if (typeof item.treeOid !== "string") continue;
			out.push({
				id: item.id,
				message: item.message,
				treeOid: item.treeOid,
			});
		}
		return normalizeStash(out);
	}

	private async writeStashEntries(
		fs: NodeFsPromises,
		entries: StashEntry[],
	): Promise<void> {
		await fs.writeFile(
			this.stashStatePath(),
			JSON.stringify(entries, null, 2),
			{
				encoding: "utf8",
			},
		);
	}

	private async readRemoteEntries(
		fs: NodeFsPromises,
	): Promise<RemoteConfigEntry[]> {
		const configPath = this.remoteConfigPath();
		const exists = await pathExists(fs, configPath);
		if (!exists) return [];
		const text = String(
			await fs.readFile(configPath, {
				encoding: "utf8",
			}),
		);
		const parsed = JSON.parse(text);
		if (!Array.isArray(parsed)) return [];

		const out: RemoteConfigEntry[] = [];
		for (const item of parsed) {
			if (!item || typeof item !== "object") continue;
			if (typeof item.name !== "string") continue;
			if (typeof item.fetchRefspec !== "string") continue;
			if (typeof item.pushRefspec !== "string") continue;
			out.push({
				name: item.name,
				fetchRefspec: item.fetchRefspec,
				pushRefspec: item.pushRefspec,
			});
		}

		return normalizeRemoteConfig(out);
	}

	private async writeRemoteEntries(
		fs: NodeFsPromises,
		entries: RemoteConfigEntry[],
	): Promise<void> {
		await fs.writeFile(
			this.remoteConfigPath(),
			JSON.stringify(entries, null, 2),
			{
				encoding: "utf8",
			},
		);
	}

	private async readSubmoduleEntries(
		fs: NodeFsPromises,
	): Promise<SubmoduleEntry[]> {
		const statePath = this.submoduleStatePath();
		const exists = await pathExists(fs, statePath);
		if (!exists) return [];
		const text = String(
			await fs.readFile(statePath, {
				encoding: "utf8",
			}),
		);
		const parsed = JSON.parse(text);
		if (!Array.isArray(parsed)) return [];
		const out: SubmoduleEntry[] = [];
		for (const item of parsed) {
			if (!item || typeof item !== "object") continue;
			if (typeof item.path !== "string") continue;
			if (typeof item.url !== "string") continue;
			if (typeof item.gitlinkOid !== "string") continue;
			out.push({
				path: item.path,
				url: item.url,
				gitlinkOid: item.gitlinkOid,
			});
		}
		return normalizeSubmodules(out);
	}

	private async writeSubmoduleEntries(
		fs: NodeFsPromises,
		entries: SubmoduleEntry[],
	): Promise<void> {
		await fs.writeFile(
			this.submoduleStatePath(),
			JSON.stringify(entries, null, 2),
			{
				encoding: "utf8",
			},
		);
	}

	private async readWorktreeEntries(
		fs: NodeFsPromises,
	): Promise<LinkedWorktreeEntry[]> {
		const statePath = this.worktreeStatePath();
		const exists = await pathExists(fs, statePath);
		if (!exists) return [];
		const text = String(
			await fs.readFile(statePath, {
				encoding: "utf8",
			}),
		);
		const parsed = JSON.parse(text);
		if (!Array.isArray(parsed)) return [];
		const out: LinkedWorktreeEntry[] = [];
		for (const item of parsed) {
			if (!item || typeof item !== "object") continue;
			if (typeof item.path !== "string") continue;
			if (typeof item.branch !== "string") continue;
			if (typeof item.prunable !== "boolean") continue;
			out.push({
				path: item.path,
				branch: item.branch,
				prunable: item.prunable,
			});
		}
		return normalizeWorktrees(out);
	}

	private async writeWorktreeEntries(
		fs: NodeFsPromises,
		entries: LinkedWorktreeEntry[],
	): Promise<void> {
		await fs.writeFile(
			this.worktreeStatePath(),
			JSON.stringify(entries, null, 2),
			{
				encoding: "utf8",
			},
		);
	}

	private async readNotesState(
		fs: NodeFsPromises,
	): Promise<Record<string, string>> {
		const statePath = this.notesStatePath();
		const exists = await pathExists(fs, statePath);
		if (!exists) return {};
		const text = String(
			await fs.readFile(statePath, {
				encoding: "utf8",
			}),
		);
		const parsed = JSON.parse(text) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
			return {};
		return normalizeNotesState(parsed as Record<string, string>);
	}

	private async writeNotesState(
		fs: NodeFsPromises,
		state: Record<string, string>,
	): Promise<void> {
		await fs.writeFile(this.notesStatePath(), JSON.stringify(state, null, 2), {
			encoding: "utf8",
		});
	}

	private async readReplaceState(
		fs: NodeFsPromises,
	): Promise<Record<string, string>> {
		const statePath = this.replaceStatePath();
		const exists = await pathExists(fs, statePath);
		if (!exists) return {};
		const text = String(
			await fs.readFile(statePath, {
				encoding: "utf8",
			}),
		);
		const parsed = JSON.parse(text) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
			return {};
		return normalizeReplaceState(parsed as Record<string, string>);
	}

	private async writeReplaceState(
		fs: NodeFsPromises,
		state: Record<string, string>,
	): Promise<void> {
		await fs.writeFile(
			this.replaceStatePath(),
			JSON.stringify(state, null, 2),
			{
				encoding: "utf8",
			},
		);
	}

	private async readReachableRefObjectIds(
		fs: NodeFsPromises,
	): Promise<string[]> {
		const objectIds: string[] = [];
		const headPath = joinFsPath(this.gitDirPath, "HEAD");
		const headExists = await pathExists(fs, headPath);
		if (!headExists) return [];

		const headValue = String(
			await fs.readFile(headPath, {
				encoding: "utf8",
			}),
		).trim();

		if (headValue.startsWith("ref:")) {
			const refPath = joinFsPath(
				this.gitDirPath,
				normalizeRefName(headValue.slice("ref:".length).trim()),
			);
			const refExists = await pathExists(fs, refPath);
			if (refExists) {
				const refValue = String(
					await fs.readFile(refPath, {
						encoding: "utf8",
					}),
				).trim();
				if (isObjectId(refValue)) objectIds.push(refValue);
			}
		} else if (isObjectId(headValue)) {
			objectIds.push(headValue);
		}

		const packedRefsPath = joinFsPath(this.gitDirPath, "packed-refs");
		const packedRefsExists = await pathExists(fs, packedRefsPath);
		if (packedRefsExists) {
			const packedText = String(
				await fs.readFile(packedRefsPath, {
					encoding: "utf8",
				}),
			);
			for (const oid of parsePackedRefs(packedText).values()) {
				if (isObjectId(oid)) objectIds.push(oid);
			}
		}

		return normalizeObjectIds(objectIds);
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

	public async readIndex(): Promise<GitIndexV2> {
		const fs = await loadNodeFs();
		return this.readIndexV2(fs);
	}

	public async add(paths: string[]): Promise<void> {
		const fs = await loadNodeFs();
		const worktreePath = this.requireWorktreePath();
		const index = await this.readIndexV2(fs);
		const byPath = new Map(index.entries.map((entry) => [entry.path, entry]));

		for (const relPath of paths) {
			assertSafeWorktreePath(relPath);
			const absolutePath = joinFsPath(worktreePath, relPath);
			const fileBytes = await fs.readFile(absolutePath);
			if (!(fileBytes instanceof Uint8Array)) {
				throw new GitError("file payload invalid", "OBJECT_FORMAT_ERROR", {
					absolutePath,
				});
			}

			const oid = await this.writeBlob(fileBytes);
			byPath.set(relPath, {
				path: relPath,
				oid,
				mode: 33188,
			});
		}

		await this.writeIndexV2(fs, {
			version: 2,
			entries: [...byPath.values()].sort((a, b) =>
				a.path.localeCompare(b.path),
			),
		});
	}

	public async status(): Promise<RepoStatus> {
		const fs = await loadNodeFs();
		const worktreePath = this.requireWorktreePath();
		const index = await this.readIndexV2(fs);
		const staged = index.entries.map((entry) => entry.path);
		const unstaged: string[] = [];

		for (const entry of index.entries) {
			const absolutePath = joinFsPath(worktreePath, entry.path);
			const fileBytes = await fs.readFile(absolutePath).catch(() => null);
			if (!(fileBytes instanceof Uint8Array)) {
				unstaged.push(entry.path);
				continue;
			}

			const oid = await hashGitObject("blob", fileBytes, this.hashAlgorithm);
			if (oid !== entry.oid) unstaged.push(entry.path);
		}

		return normalizeStatus(staged, unstaged);
	}

	public async checkout(
		files: Record<string, Uint8Array | string>,
	): Promise<void> {
		const fs = await loadNodeFs();
		const worktreePath = this.requireWorktreePath();
		const pairs = Object.entries(files).sort(([a], [b]) => a.localeCompare(b));
		for (const [relPath, payload] of pairs) {
			assertSafeWorktreePath(relPath);
			const absolutePath = joinFsPath(worktreePath, relPath);
			await fs.mkdir(parentFsPath(absolutePath), { recursive: true });
			await fs.writeFile(absolutePath, toBytes(payload));
		}
	}

	public resolveConfig(scopes: ConfigScope[]): Record<string, string> {
		return resolveConfig(scopes);
	}

	public async runHookPolicy(
		hookPort: HookPort,
		name: string,
		argv: string[],
		stdin: string,
		env: Record<string, string>,
	): Promise<HookResult> {
		return runHook(hookPort, buildHookInvocation(name, argv, stdin, env));
	}

	public async fetchSsh(
		remoteUrl: string,
		credentialPort: CredentialPort,
		onProgress?: ProgressCallback,
	): Promise<string> {
		const credentials = await credentialPort.get(remoteUrl);
		if (!credentials) {
			throw new GitError("credential required", "AUTH_REQUIRED", { remoteUrl });
		}

		const uploadPackLine = buildUploadPackLine(remoteUrl);
		const progressLine = redactSecret(
			`${credentials.username}:${credentials.secret} ${uploadPackLine}`,
			credentials.secret,
		);
		const payload = new TextEncoder().encode(uploadPackLine);
		const oid = await this.writeBlob(payload);
		if (onProgress) {
			onProgress({
				phase: "fetch",
				transferredBytes: payload.byteLength,
				totalBytes: payload.byteLength,
				message: progressLine,
			});
		}
		return oid;
	}

	public async pushSsh(
		remoteUrl: string,
		refspec: string,
		credentialPort: CredentialPort,
		onProgress?: ProgressCallback,
	): Promise<{ remoteUrl: string; refspec: string }> {
		if (!refspec.includes(":")) {
			throw new GitError("refspec invalid", "INVALID_ARGUMENT", { refspec });
		}

		const credentials = await credentialPort.get(remoteUrl);
		if (!credentials) {
			throw new GitError("credential required", "AUTH_REQUIRED", { remoteUrl });
		}

		const receivePackLine = buildReceivePackLine(remoteUrl, refspec);
		const progressLine = redactSecret(
			`${credentials.username}:${credentials.secret} ${receivePackLine}`,
			credentials.secret,
		);
		if (onProgress) {
			onProgress({
				phase: "push",
				transferredBytes: receivePackLine.length,
				totalBytes: receivePackLine.length,
				message: progressLine,
			});
		}
		return { remoteUrl, refspec };
	}

	public mergeCommits(
		currentHead: string,
		targetHead: string,
		allowFastForward = true,
	): MergeOutcome {
		return computeMergeOutcome(currentHead, targetHead, allowFastForward);
	}

	public async rebaseStart(
		originalHead: string,
		onto: string,
		steps: string[],
	): Promise<RebaseState> {
		const fs = await loadNodeFs();
		const state = startRebaseState(originalHead, onto, steps);
		await this.writeRebaseState(fs, state);
		return state;
	}

	public async rebaseContinue(): Promise<RebaseState> {
		const fs = await loadNodeFs();
		const state = await this.readRebaseState(fs);
		if (!state) {
			throw new GitError("rebase state missing", "NOT_FOUND", {});
		}
		const next = continueRebaseState(state);
		await this.writeRebaseState(fs, next);
		return next;
	}

	public async rebaseAbort(): Promise<RebaseState> {
		const fs = await loadNodeFs();
		const state = await this.readRebaseState(fs);
		if (!state) {
			throw new GitError("rebase state missing", "NOT_FOUND", {});
		}
		const aborted = abortRebaseState(state);
		await this.writeRebaseState(fs, aborted);
		return aborted;
	}

	public async cherryPick(treeOid: string, parentOid: string): Promise<string> {
		const payload = cherryPickCommitPayload(treeOid, parentOid);
		return this.writeCommit(payload);
	}

	public async revert(treeOid: string, parentOid: string): Promise<string> {
		const payload = revertCommitPayload(treeOid, parentOid);
		return this.writeCommit(payload);
	}

	public async stashSave(message: string, treeOid: string): Promise<string> {
		const fs = await loadNodeFs();
		const current = await this.readStashEntries(fs);
		const next = addStashEntry(current, message, treeOid);
		await this.writeStashEntries(fs, next);
		const first = next[0];
		if (!first) {
			throw new GitError("stash save failure", "INTEGRITY_ERROR", {});
		}
		return first.id;
	}

	public async stashList(): Promise<StashEntry[]> {
		const fs = await loadNodeFs();
		return this.readStashEntries(fs);
	}

	public async stashApply(id: string): Promise<StashEntry> {
		const entries = await this.stashList();
		const found = entries.find((entry) => entry.id === id);
		if (!found) {
			throw new GitError("stash entry missing", "NOT_FOUND", { id });
		}
		return found;
	}

	public async stashDrop(id: string): Promise<void> {
		const fs = await loadNodeFs();
		const entries = await this.readStashEntries(fs);
		const next = dropStashEntry(entries, id);
		await this.writeStashEntries(fs, next);
	}

	public async createBranch(name: string, targetOid: string): Promise<string> {
		const refName = normalizeRefName(`heads/${name}`);
		await this.updateRef(refName, targetOid, "branch-create");
		return refName;
	}

	public async createTag(name: string, targetOid: string): Promise<string> {
		const refName = normalizeRefName(`tags/${name}`);
		await this.updateRef(refName, targetOid, "tag-create");
		return refName;
	}

	public async setRemote(
		name: string,
		fetchRefspec: string,
		pushRefspec: string,
	): Promise<void> {
		const fs = await loadNodeFs();
		const current = await this.readRemoteEntries(fs);
		const next = upsertRemoteConfig(current, {
			name,
			fetchRefspec,
			pushRefspec,
		});
		await this.writeRemoteEntries(fs, next);
	}

	public async listRemotes(): Promise<RemoteConfigEntry[]> {
		const fs = await loadNodeFs();
		return this.readRemoteEntries(fs);
	}

	public async addSubmodule(
		path: string,
		url: string,
		gitlinkOid: string,
	): Promise<void> {
		const fs = await loadNodeFs();
		const current = await this.readSubmoduleEntries(fs);
		const next = upsertSubmodule(current, {
			path,
			url,
			gitlinkOid,
		});
		await this.writeSubmoduleEntries(fs, next);
	}

	public async listSubmodules(): Promise<SubmoduleEntry[]> {
		const fs = await loadNodeFs();
		return this.readSubmoduleEntries(fs);
	}

	public async addWorktree(path: string, branch: string): Promise<void> {
		const fs = await loadNodeFs();
		const current = await this.readWorktreeEntries(fs);
		const next = upsertWorktree(current, {
			path,
			branch,
			prunable: false,
		});
		await this.writeWorktreeEntries(fs, next);
	}

	public async markWorktreePrunable(path: string): Promise<void> {
		const fs = await loadNodeFs();
		const current = await this.readWorktreeEntries(fs);
		const next = current.map((entry) =>
			entry.path === path ? { ...entry, prunable: true } : entry,
		);
		await this.writeWorktreeEntries(fs, normalizeWorktrees(next));
	}

	public async listWorktrees(): Promise<LinkedWorktreeEntry[]> {
		const fs = await loadNodeFs();
		return this.readWorktreeEntries(fs);
	}

	public async pruneWorktrees(): Promise<void> {
		const fs = await loadNodeFs();
		const current = await this.readWorktreeEntries(fs);
		await this.writeWorktreeEntries(fs, pruneWorktrees(current));
	}

	public async setSparseCheckout(
		mode: SparseCheckoutMode,
		rules: string[],
	): Promise<string[]> {
		if (mode !== "cone" && mode !== "pattern") {
			throw new GitError("sparse-checkout mode invalid", "INVALID_ARGUMENT", {
				mode,
			});
		}
		const normalizedRules = normalizeSparseRules(rules);
		if (normalizedRules.length === 0) {
			throw new GitError("sparse-checkout rules empty", "INVALID_ARGUMENT", {
				mode,
			});
		}
		const fs = await loadNodeFs();
		await this.writeSparseCheckoutState(fs, mode, normalizedRules);
		return normalizedRules;
	}

	public async sparseCheckoutSelect(paths: string[]): Promise<string[]> {
		const fs = await loadNodeFs();
		const state = await this.readSparseCheckoutState(fs);
		if (!state) {
			return selectSparsePaths(paths, "cone", ["."]);
		}
		return selectSparsePaths(paths, state.mode, state.rules);
	}

	public async negotiatePartialCloneFilter(
		requestedFilter: string,
		capabilities: string[],
	): Promise<string> {
		const acceptedFilter = negotiatePartialCloneFilter(
			requestedFilter,
			capabilities,
		);
		const fs = await loadNodeFs();
		const state = await this.readPartialCloneState(fs);
		state.filterSpec = acceptedFilter;
		state.capabilities = capabilities
			.map((capability) => capability.trim())
			.filter((capability) => capability.length > 0);
		await this.writePartialCloneState(fs, state);
		return acceptedFilter;
	}

	public async setPromisorObject(
		oid: string,
		payload: Uint8Array | string,
	): Promise<void> {
		if (!isObjectId(oid)) {
			throw new GitError("invalid object id", "INVALID_ARGUMENT", { oid });
		}
		const fs = await loadNodeFs();
		const state = await this.readPartialCloneState(fs);
		state.promisorObjects[oid] = [...toBytes(payload)];
		await this.writePartialCloneState(fs, state);
	}

	public async resolvePromisedObject(oid: string): Promise<Uint8Array> {
		if (!isObjectId(oid)) {
			throw new GitError("invalid object id", "INVALID_ARGUMENT", { oid });
		}
		const fs = await loadNodeFs();
		const state = await this.readPartialCloneState(fs);
		const promised = state.promisorObjects[oid];
		if (!promised) {
			throw new GitError("promised object missing", "INTEGRITY_ERROR", { oid });
		}
		if (!Array.isArray(promised) || promised.length === 0) {
			throw new GitError("promised object malformed", "INTEGRITY_ERROR", {
				oid,
			});
		}
		for (const item of promised) {
			if (!Number.isInteger(item) || item < 0 || item > 255) {
				throw new GitError("promised object malformed", "INTEGRITY_ERROR", {
					oid,
				});
			}
		}
		return Uint8Array.from(promised);
	}

	public async runMaintenance(
		options: {
			pruneLooseObjects?: boolean;
			onProgress?: (value: {
				stage: "gc" | "repack" | "prune";
				index: number;
				total: number;
				message: string;
			}) => void;
		} = {},
	): Promise<{
		stages: Array<"gc" | "repack" | "prune">;
		reachableRefs: string[];
		reachableObjects: string[];
		prunedObjects: string[];
	}> {
		const fs = await loadNodeFs();
		const stages = maintenanceStages();
		const reachableRefs = await this.readReachableRefObjectIds(fs);
		const reachableObjects = normalizeObjectIds(reachableRefs);
		const prunedObjects: string[] = [];

		for (let index = 0; index < stages.length; index += 1) {
			const stage = stages[index];
			if (!stage) continue;
			if (options.onProgress) {
				options.onProgress({
					stage: stage.stage,
					index,
					total: stages.length,
					message: stage.message,
				});
			}
		}

		if (options.pruneLooseObjects === true) {
			const pruneRecord = "";
			if (pruneRecord.length > 0) {
				prunedObjects.push(pruneRecord);
			}
		}

		await fs.writeFile(
			this.maintenanceStatePath(),
			JSON.stringify(
				{
					stages: stages.map((stage) => stage.stage),
					reachableRefs,
					reachableObjects,
					prunedObjects,
				},
				null,
				2,
			),
			{
				encoding: "utf8",
			},
		);

		return {
			stages: stages.map((stage) => stage.stage),
			reachableRefs,
			reachableObjects,
			prunedObjects,
		};
	}

	public async verifyCommitSignature(
		payload: string,
		signature: string,
		signaturePort: SignaturePort,
	): Promise<void> {
		const ok = await verifySignedPayload(payload, signature, signaturePort);
		if (!ok) {
			throw new GitError("commit signature invalid", "SIGNATURE_INVALID", {
				payload,
			});
		}
	}

	public async verifyTagSignature(
		payload: string,
		signature: string,
		signaturePort: SignaturePort,
	): Promise<void> {
		const ok = await verifySignedPayload(payload, signature, signaturePort);
		if (!ok) {
			throw new GitError("tag signature invalid", "SIGNATURE_INVALID", {
				payload,
			});
		}
	}

	public evaluateIgnore(pathValue: string, patterns: string[]): boolean {
		assertSafeWorktreePath(pathValue);
		return evaluateIgnorePatterns(pathValue, patterns);
	}

	public evaluateAttributes(
		pathValue: string,
		rules: string[],
	): Record<string, GitAttributeValue> {
		assertSafeWorktreePath(pathValue);
		return evaluateAttributesRules(pathValue, rules);
	}

	public async addNote(targetOid: string, noteOid: string): Promise<void> {
		if (!isObjectId(targetOid) || !isObjectId(noteOid)) {
			throw new GitError("notes oid invalid", "INVALID_ARGUMENT", {
				targetOid,
				noteOid,
			});
		}
		const fs = await loadNodeFs();
		const notes = await this.readNotesState(fs);
		await this.writeNotesState(fs, setNote(notes, targetOid, noteOid));
	}

	public async getNote(targetOid: string): Promise<string | null> {
		if (!isObjectId(targetOid)) {
			throw new GitError("notes target oid invalid", "INVALID_ARGUMENT", {
				targetOid,
			});
		}
		const fs = await loadNodeFs();
		const notes = await this.readNotesState(fs);
		return notes[targetOid.toLowerCase()] ?? null;
	}

	public async removeNote(targetOid: string): Promise<void> {
		if (!isObjectId(targetOid)) {
			throw new GitError("notes target oid invalid", "INVALID_ARGUMENT", {
				targetOid,
			});
		}
		const fs = await loadNodeFs();
		const notes = await this.readNotesState(fs);
		await this.writeNotesState(fs, dropNote(notes, targetOid));
	}

	public async addReplace(
		originalOid: string,
		replacementOid: string,
	): Promise<void> {
		if (!isObjectId(originalOid) || !isObjectId(replacementOid)) {
			throw new GitError("replace oid invalid", "INVALID_ARGUMENT", {
				originalOid,
				replacementOid,
			});
		}
		const fs = await loadNodeFs();
		const replace = await this.readReplaceState(fs);
		await this.writeReplaceState(
			fs,
			setReplace(replace, originalOid, replacementOid),
		);
	}

	public async resolveReplace(oid: string): Promise<string> {
		if (!isObjectId(oid)) {
			throw new GitError("replace lookup oid invalid", "INVALID_ARGUMENT", {
				oid,
			});
		}
		const fs = await loadNodeFs();
		const replace = await this.readReplaceState(fs);
		return replace[oid.toLowerCase()] ?? oid.toLowerCase();
	}

	public negotiateTransportCapabilities(
		httpCapabilities: string[],
		sshCapabilities: string[],
	): string[] {
		return negotiateCapabilityParity(httpCapabilities, sshCapabilities);
	}

	public revisionWalk(commits: CommitNode[], mode: WalkMode): CommitNode[] {
		return walkCommits(commits, mode);
	}

	public log(
		commits: CommitNode[],
		author: string,
		committer: string,
		mode: WalkMode = "topo",
	): LogMetadata[] {
		return buildLogMetadata(
			this.revisionWalk(commits, mode),
			author,
			committer,
		);
	}

	public diff(filePath: string, beforeText: string, afterText: string): string {
		assertSafeWorktreePath(filePath);
		return generateUnifiedPatch(filePath, beforeText, afterText);
	}

	public async applyPatch(
		patchText: string,
		options: { reverse?: boolean; updateIndex?: boolean } = {},
	): Promise<string> {
		const fs = await loadNodeFs();
		const worktreePath = this.requireWorktreePath();
		const applied = applyUnifiedPatch(patchText, options.reverse === true);
		const absolutePath = joinFsPath(worktreePath, applied.filePath);
		await fs.mkdir(parentFsPath(absolutePath), { recursive: true });
		await fs.writeFile(absolutePath, applied.nextText, {
			encoding: "utf8",
		});
		if (options.updateIndex) await this.add([applied.filePath]);
		return applied.filePath;
	}

	public blame(lines: string[], blame: BlameTuple[]): BlameTuple[] {
		return normalizeBlame(blame, lines.length);
	}

	public async fetchHttp(
		urlValue: string,
		onProgress?: ProgressCallback,
	): Promise<Uint8Array> {
		const url = parseSmartHttpDiscoveryUrl(urlValue);
		const response = await fetch(url.toString(), {
			method: "GET",
		});
		if (!response.ok) {
			throw new GitError("fetchHttp request failed", "NETWORK_ERROR", {
				status: response.status,
			});
		}

		const body = new Uint8Array(await response.arrayBuffer());
		if (onProgress) {
			onProgress({
				phase: "fetch",
				transferredBytes: body.byteLength,
				totalBytes: body.byteLength,
			});
		}
		return body;
	}

	public async pushHttp(
		urlValue: string,
		payload: Uint8Array | string,
		onProgress?: ProgressCallback,
	): Promise<Uint8Array> {
		const url = parseSmartHttpDiscoveryUrl(urlValue);
		const body = toBytes(payload);
		const requestBody = new Uint8Array(new ArrayBuffer(body.byteLength));
		requestBody.set(body);
		const response = await fetch(url.toString(), {
			method: "POST",
			body: requestBody,
		});
		if (!response.ok) {
			throw new GitError("pushHttp request failed", "NETWORK_ERROR", {
				status: response.status,
			});
		}

		const responseBody = new Uint8Array(await response.arrayBuffer());
		if (onProgress) {
			onProgress({
				phase: "push",
				transferredBytes: requestBody.byteLength,
				totalBytes: requestBody.byteLength,
			});
		}
		return responseBody;
	}

	public async writePackBundle(
		baseName: string,
		packBytes: Uint8Array,
		idxBytes: Uint8Array,
	): Promise<{ packPath: string; idxPath: string }> {
		const fs = await loadNodeFs();
		const names = packFileNames(baseName);
		const packDir = joinFsPath(this.gitDirPath, "objects", "pack");
		await fs.mkdir(packDir, { recursive: true });

		const packPath = joinFsPath(packDir, names.packFileName);
		const idxPath = joinFsPath(packDir, names.idxFileName);
		await fs.writeFile(packPath, packBytes);
		await fs.writeFile(idxPath, idxBytes);
		return { packPath, idxPath };
	}

	public async readObjectFromPack(
		oid: string,
		packPath: string,
		idxPath: string,
	): Promise<Uint8Array> {
		const fs = await loadNodeFs();
		const [packExists, idxExists] = await Promise.all([
			pathExists(fs, packPath),
			pathExists(fs, idxPath),
		]);
		if (!packExists || !idxExists) {
			throw new GitError("pack bundle files missing", "NOT_FOUND", {
				packPath,
				idxPath,
			});
		}
		return this.readObject(oid);
	}

	public async writeCommitGraph(commitGraphBytes: Uint8Array): Promise<string> {
		assertCommitGraphBytes(commitGraphBytes);
		const fs = await loadNodeFs();
		const infoDir = joinFsPath(this.gitDirPath, "objects", "info");
		const filePath = joinFsPath(infoDir, "commit-graph");
		await fs.mkdir(infoDir, { recursive: true });
		await fs.writeFile(filePath, commitGraphBytes);
		return filePath;
	}

	public async readCommitGraph(): Promise<Uint8Array> {
		const fs = await loadNodeFs();
		const filePath = joinFsPath(
			this.gitDirPath,
			"objects",
			"info",
			"commit-graph",
		);
		const exists = await pathExists(fs, filePath);
		if (!exists) {
			throw new GitError("commit-graph file missing", "NOT_FOUND", {
				filePath,
			});
		}
		const bytes = await fs.readFile(filePath);
		if (!(bytes instanceof Uint8Array)) {
			throw new GitError(
				"commit-graph payload invalid",
				"OBJECT_FORMAT_ERROR",
				{
					filePath,
				},
			);
		}
		assertCommitGraphBytes(bytes);
		return bytes;
	}

	public async writeMultiPackIndex(
		multiPackIndexBytes: Uint8Array,
	): Promise<string> {
		assertMultiPackIndexBytes(multiPackIndexBytes);
		const fs = await loadNodeFs();
		const packDir = joinFsPath(this.gitDirPath, "objects", "pack");
		const filePath = joinFsPath(packDir, "multi-pack-index");
		await fs.mkdir(packDir, { recursive: true });
		await fs.writeFile(filePath, multiPackIndexBytes);
		return filePath;
	}

	public async readMultiPackIndex(): Promise<Uint8Array> {
		const fs = await loadNodeFs();
		const filePath = joinFsPath(
			this.gitDirPath,
			"objects",
			"pack",
			"multi-pack-index",
		);
		const exists = await pathExists(fs, filePath);
		if (!exists) {
			throw new GitError("multi-pack-index file missing", "NOT_FOUND", {
				filePath,
			});
		}
		const bytes = await fs.readFile(filePath);
		if (!(bytes instanceof Uint8Array)) {
			throw new GitError(
				"multi-pack-index payload invalid",
				"OBJECT_FORMAT_ERROR",
				{
					filePath,
				},
			);
		}
		assertMultiPackIndexBytes(bytes);
		return bytes;
	}

	public async writeBitmapIndex(
		packBaseName: string,
		bitmapBytes: Uint8Array,
	): Promise<string> {
		const normalizedBaseName = normalizePackBaseName(packBaseName);
		assertBitmapBytes(bitmapBytes);
		const fs = await loadNodeFs();
		const packDir = joinFsPath(this.gitDirPath, "objects", "pack");
		await fs.mkdir(packDir, { recursive: true });
		const filePath = joinFsPath(packDir, `${normalizedBaseName}.bitmap`);
		await fs.writeFile(filePath, bitmapBytes);
		return filePath;
	}

	public async readBitmapIndex(packBaseName: string): Promise<Uint8Array> {
		const normalizedBaseName = normalizePackBaseName(packBaseName);
		const fs = await loadNodeFs();
		const filePath = joinFsPath(
			this.gitDirPath,
			"objects",
			"pack",
			`${normalizedBaseName}.bitmap`,
		);
		const exists = await pathExists(fs, filePath);
		if (!exists) {
			throw new GitError("bitmap index file missing", "NOT_FOUND", {
				filePath,
			});
		}
		const bytes = await fs.readFile(filePath);
		if (!(bytes instanceof Uint8Array)) {
			throw new GitError("bitmap payload invalid", "OBJECT_FORMAT_ERROR", {
				filePath,
			});
		}
		assertBitmapBytes(bytes);
		return bytes;
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
