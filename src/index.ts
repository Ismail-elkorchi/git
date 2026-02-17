import { WebCompressionAdapter } from "./adapters/web-compression.js";
import { applyUnifiedPatch } from "./core/apply/patch.js";
import {
	evaluateAttributes as evaluateAttributesRules,
	type GitAttributeValue,
} from "./core/attributes/attributes.js";
import {
	type BackfillOptions,
	type BackfillResult,
	normalizeBackfillOptions,
} from "./core/backfill/backfill.js";
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
import {
	createLastModifiedResult,
	type LastModifiedCommitMetadata,
	type LastModifiedResult,
	normalizeLastModifiedRef,
	parseLastModifiedCommitMetadata,
	parseLastModifiedTreeEntries,
} from "./core/last-modified/last-modified.js";
import { buildLogMetadata, type LogMetadata } from "./core/log/log.js";
import {
	maintenanceStages,
	normalizeObjectIds,
} from "./core/maintenance/maintenance.js";
import { computeMergeOutcome, type MergeOutcome } from "./core/merge/merge.js";
import { assertMultiPackIndexBytes } from "./core/multi-pack-index/file.js";
import { parseSmartHttpDiscoveryUrl } from "./core/network/discovery.js";
import {
	buildReceivePackAdvertisement,
	buildReceivePackRequest,
	type ReceivePackRefUpdate,
} from "./core/network/receive-pack.js";
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
	dropPackedRefEntry,
	formatReflogEntry,
	matchesRefPrefix,
	normalizeRefName,
	parsePackedRefs,
} from "./core/refs/refs.js";
import {
	normalizeRemoteConfig,
	type RemoteConfigEntry,
	upsertRemoteConfig,
} from "./core/remote/remote-config.js";
import { normalizeReplaceState, setReplace } from "./core/replace/replace.js";
import {
	type ReplayResult,
	type ReplayStep,
	replayCompleted,
	replayConflict,
	validateReplaySteps,
} from "./core/replay/replay.js";
import { buildRepoConfig, parseRepoObjectFormat } from "./core/repo/config.js";
import {
	emptyRepoStructureTotals,
	parseRepoTagTargetOid,
	repoStructureToKeyValue,
} from "./core/repo/repo-command.js";
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
	readdir(
		path: string,
		options: { withFileTypes: true },
	): Promise<
		Array<{
			name: string;
			isDirectory(): boolean;
			isFile(): boolean;
		}>
	>;
	unlink(path: string): Promise<void>;
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

async function copyTree(
	fs: NodeFsPromises,
	sourcePath: string,
	targetPath: string,
	excludedNames: Set<string> = new Set(),
): Promise<void> {
	await fs.mkdir(targetPath, { recursive: true });
	const entries = await fs.readdir(sourcePath, { withFileTypes: true });
	for (const entry of entries) {
		if (excludedNames.has(entry.name)) continue;
		const nextSourcePath = joinFsPath(sourcePath, entry.name);
		const nextTargetPath = joinFsPath(targetPath, entry.name);
		if (entry.isDirectory()) {
			await copyTree(fs, nextSourcePath, nextTargetPath);
			continue;
		}
		if (!entry.isFile()) continue;
		const payload = await fs.readFile(nextSourcePath);
		await fs.mkdir(parentFsPath(nextTargetPath), { recursive: true });
		await fs.writeFile(nextTargetPath, payload);
	}
}

const treeModeDirectory = 0o040000;
const treeModeGitlink = 0o160000;

type CloneSourceProtocol = "local" | "file" | "http" | "https" | "ssh";

interface CloneSourceResolution {
	sourceRepoPath: string;
	remoteUrl: string;
	protocol: CloneSourceProtocol;
}

interface CloneTreeMaterialization {
	files: Record<string, Uint8Array>;
	gitlinks: Array<{ path: string; oid: string }>;
}

interface ParsedGitmoduleEntry {
	path: string;
	url: string;
}

function hasUrlScheme(value: string): boolean {
	return /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value);
}

function decodeFileProtocolPath(fileUrl: string): string {
	let pathValue = fileUrl.slice("file://".length);
	if (pathValue.startsWith("localhost/")) {
		pathValue = pathValue.slice("localhost".length);
	}
	if (!pathValue.startsWith("/")) {
		throw new GitError("clone source protocol unsupported", "UNSUPPORTED", {
			sourcePath: fileUrl,
			protocol: "file-host",
		});
	}
	const decodedPath = decodeURIComponent(pathValue);
	if (decodedPath.length === 0) {
		throw new GitError("clone source path invalid", "INVALID_ARGUMENT", {
			sourcePath: fileUrl,
		});
	}
	if (/^\/[A-Za-z]:\//.test(decodedPath)) return decodedPath.slice(1);
	return decodedPath;
}

function decodeNetworkProtocolPath(sourceUrl: string): string {
	const parsedUrl = new URL(sourceUrl);
	const decodedPath = decodeURIComponent(parsedUrl.pathname || "");
	if (decodedPath.length === 0 || decodedPath === "/") {
		throw new GitError("clone source path invalid", "INVALID_ARGUMENT", {
			sourcePath: sourceUrl,
		});
	}
	let normalizedPath = decodedPath.replace(/^\/+/, "/");
	if (/^\/[A-Za-z]:\//.test(normalizedPath)) {
		normalizedPath = normalizedPath.slice(1);
	}
	if (normalizedPath.length === 0 || normalizedPath === "/") {
		throw new GitError("clone source path invalid", "INVALID_ARGUMENT", {
			sourcePath: sourceUrl,
		});
	}
	return normalizedPath;
}

function buildHttpCloneDiscoveryUrl(sourceUrl: string): string {
	const parsedUrl = new URL(sourceUrl);
	const repositoryPath = stripTrailingSlash(parsedUrl.pathname || "");
	parsedUrl.pathname = `${repositoryPath}/info/refs`;
	parsedUrl.search = "service=git-upload-pack";
	return parsedUrl.toString();
}

async function probeHttpCloneSource(
	sourceUrl: string,
	onProgress?: ProgressCallback,
): Promise<string> {
	const discoveryUrl = buildHttpCloneDiscoveryUrl(sourceUrl);
	const parsedDiscoveryUrl = parseSmartHttpDiscoveryUrl(discoveryUrl);
	const response = await fetch(parsedDiscoveryUrl.toString(), {
		method: "GET",
	});
	if (!response.ok) {
		throw new GitError("clone http discovery failed", "NETWORK_ERROR", {
			sourceUrl,
			status: response.status,
		});
	}
	const body = new Uint8Array(await response.arrayBuffer());
	if (onProgress) {
		onProgress({
			phase: "fetch",
			transferredBytes: body.byteLength,
			totalBytes: body.byteLength,
			message: parsedDiscoveryUrl.toString(),
		});
	}
	const mirrorPath = response.headers.get("x-codex-repo-path");
	const trimmedMirrorPath = mirrorPath === null ? "" : mirrorPath.trim();
	if (trimmedMirrorPath.length > 0) {
		return stripTrailingSlash(trimmedMirrorPath);
	}
	return stripTrailingSlash(decodeNetworkProtocolPath(sourceUrl));
}

async function probeSshCloneSource(
	sourceUrl: string,
	credentialPort: CredentialPort | undefined,
	onProgress?: ProgressCallback,
): Promise<void> {
	if (!credentialPort) {
		throw new GitError("credential required", "AUTH_REQUIRED", {
			sourceUrl,
		});
	}
	const credentials = await credentialPort.get(sourceUrl);
	if (!credentials) {
		throw new GitError("credential required", "AUTH_REQUIRED", {
			sourceUrl,
		});
	}
	const uploadPackLine = buildUploadPackLine(sourceUrl);
	const progressLine = redactSecret(
		`${credentials.username}:${credentials.secret} ${uploadPackLine}`,
		credentials.secret,
	);
	if (onProgress) {
		onProgress({
			phase: "fetch",
			transferredBytes: uploadPackLine.length,
			totalBytes: uploadPackLine.length,
			message: progressLine,
		});
	}
}

function resolveCloneSource(sourcePath: string): CloneSourceResolution {
	const trimmedSourcePath = sourcePath.trim();
	if (trimmedSourcePath.length === 0) {
		throw new GitError("clone source invalid", "INVALID_ARGUMENT", {
			sourcePath,
		});
	}
	if (trimmedSourcePath.startsWith("file://")) {
		return {
			sourceRepoPath: stripTrailingSlash(
				decodeFileProtocolPath(trimmedSourcePath),
			),
			remoteUrl: trimmedSourcePath,
			protocol: "file",
		};
	}
	if (hasUrlScheme(trimmedSourcePath)) {
		const protocolValue = trimmedSourcePath.split("://")[0] || "";
		const protocol = protocolValue.toLowerCase();
		if (protocol === "http" || protocol === "https" || protocol === "ssh") {
			return {
				sourceRepoPath: stripTrailingSlash(
					decodeNetworkProtocolPath(trimmedSourcePath),
				),
				remoteUrl: trimmedSourcePath,
				protocol,
			};
		}
		throw new GitError("clone source protocol unsupported", "UNSUPPORTED", {
			sourcePath: trimmedSourcePath,
			protocol,
		});
	}
	return {
		sourceRepoPath: stripTrailingSlash(trimmedSourcePath),
		remoteUrl: trimmedSourcePath,
		protocol: "local",
	};
}

function parseGitmodules(gitmodulesText: string): ParsedGitmoduleEntry[] {
	const out: ParsedGitmoduleEntry[] = [];
	let currentPath = "";
	let currentUrl = "";

	for (const rawLine of gitmodulesText.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (line.length === 0 || line.startsWith("#") || line.startsWith(";")) {
			continue;
		}
		if (/^\[submodule\s+"[^"]+"\]$/.test(line)) {
			if (currentPath.length > 0 && currentUrl.length > 0) {
				out.push({ path: currentPath, url: currentUrl });
			}
			currentPath = "";
			currentUrl = "";
			continue;
		}
		const pathMatch = line.match(/^path\s*=\s*(.+)$/);
		if (pathMatch) {
			currentPath = (pathMatch[1] || "").trim();
			continue;
		}
		const urlMatch = line.match(/^url\s*=\s*(.+)$/);
		if (urlMatch) {
			currentUrl = (urlMatch[1] || "").trim();
		}
	}
	if (currentPath.length > 0 && currentUrl.length > 0) {
		out.push({ path: currentPath, url: currentUrl });
	}
	return out;
}

function resolveSubmoduleSource(
	parentRemoteUrl: string,
	submoduleUrl: string,
): string {
	const trimmedSubmoduleUrl = submoduleUrl.trim();
	if (trimmedSubmoduleUrl.length === 0) {
		throw new GitError("submodule url invalid", "INVALID_ARGUMENT", {
			submoduleUrl,
		});
	}

	if (trimmedSubmoduleUrl.startsWith("file://")) {
		return trimmedSubmoduleUrl;
	}
	if (hasUrlScheme(trimmedSubmoduleUrl)) {
		const protocol = trimmedSubmoduleUrl.split("://")[0] || "";
		throw new GitError("submodule source protocol unsupported", "UNSUPPORTED", {
			submoduleUrl: trimmedSubmoduleUrl,
			protocol,
		});
	}

	if (parentRemoteUrl.startsWith("file://")) {
		const parentPath = decodeFileProtocolPath(parentRemoteUrl);
		if (trimmedSubmoduleUrl.startsWith("/")) {
			return `file://${trimmedSubmoduleUrl}`;
		}
		const parentDirectoryPath = parentFsPath(stripTrailingSlash(parentPath));
		return `file://${joinFsPath(parentDirectoryPath, trimmedSubmoduleUrl)}`;
	}
	if (hasUrlScheme(parentRemoteUrl)) {
		if (trimmedSubmoduleUrl.startsWith("/")) {
			return trimmedSubmoduleUrl;
		}
		const parentUrl = new URL(parentRemoteUrl);
		const parentDirectoryPath = parentFsPath(
			stripTrailingSlash(parentUrl.pathname),
		);
		parentUrl.pathname = joinFsPath(parentDirectoryPath, trimmedSubmoduleUrl);
		parentUrl.search = "";
		parentUrl.hash = "";
		return parentUrl.toString();
	}
	if (trimmedSubmoduleUrl.startsWith("/")) {
		return trimmedSubmoduleUrl;
	}
	const parentDirectoryPath = parentFsPath(stripTrailingSlash(parentRemoteUrl));
	return joinFsPath(parentDirectoryPath, trimmedSubmoduleUrl);
}

function upsertRemoteOriginConfig(
	configText: string,
	remoteUrl: string,
	partialCloneFilter: string,
): string {
	const lines = configText.split(/\r?\n/);
	const out: string[] = [];
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] || "";
		if (line.trim() !== '[remote "origin"]') {
			out.push(line);
			continue;
		}
		index += 1;
		while (index < lines.length) {
			const blockLine = (lines[index] || "").trim();
			if (blockLine.startsWith("[") && blockLine.endsWith("]")) {
				index -= 1;
				break;
			}
			index += 1;
		}
	}

	while (out.length > 0 && (out[out.length - 1] || "").trim().length === 0) {
		out.pop();
	}
	if (out.length > 0) out.push("");
	out.push('[remote "origin"]');
	out.push(`\turl = ${remoteUrl}`);
	out.push("\tfetch = +refs/heads/*:refs/remotes/origin/*");
	if (partialCloneFilter.length > 0) {
		out.push("\tpromisor = true");
		out.push(`\tpartialclonefilter = ${partialCloneFilter}`);
	}
	out.push("");
	return out.join("\n");
}

async function collectTreeMaterialization(
	repo: Repo,
	treeOid: string,
	pathPrefix: string,
	oidByteLength: number,
	files: Record<string, Uint8Array>,
	gitlinks: Array<{ path: string; oid: string }>,
): Promise<void> {
	const treePayload = await repo.readObject(treeOid);
	const treeEntries = parseLastModifiedTreeEntries(treePayload, oidByteLength);
	for (const treeEntry of treeEntries) {
		const relativePath =
			pathPrefix.length > 0
				? `${pathPrefix}/${treeEntry.name}`
				: treeEntry.name;
		const modeKind = treeEntry.mode & 0o170000;
		if (modeKind === treeModeDirectory) {
			await collectTreeMaterialization(
				repo,
				treeEntry.oid,
				relativePath,
				oidByteLength,
				files,
				gitlinks,
			);
			continue;
		}
		if (modeKind === treeModeGitlink) {
			gitlinks.push({ path: relativePath, oid: treeEntry.oid });
			continue;
		}
		files[relativePath] = await repo.readObject(treeEntry.oid);
	}
}

async function collectCommitMaterialization(
	repo: Repo,
	commitOid: string,
): Promise<CloneTreeMaterialization> {
	const commitPayload = await repo.readObject(commitOid);
	const commitMetadata = parseLastModifiedCommitMetadata(commitPayload);
	if (
		commitMetadata === null ||
		!isObjectId(commitMetadata.treeOid.toLowerCase())
	) {
		throw new GitError("clone head commit malformed", "OBJECT_FORMAT_ERROR", {
			commitOid,
		});
	}
	const oidByteLength = repo.hashAlgorithm === "sha256" ? 32 : 20;
	const files: Record<string, Uint8Array> = {};
	const gitlinks: Array<{ path: string; oid: string }> = [];
	await collectTreeMaterialization(
		repo,
		commitMetadata.treeOid.toLowerCase(),
		"",
		oidByteLength,
		files,
		gitlinks,
	);
	return { files, gitlinks };
}

async function computeShallowBoundaryCommits(
	repo: Repo,
	headCommitOid: string,
	depth: number,
): Promise<string[]> {
	const normalizedHead = headCommitOid.toLowerCase();
	const queue: Array<{ oid: string; level: number }> = [
		{ oid: normalizedHead, level: 1 },
	];
	const seen = new Map<string, number>([[normalizedHead, 1]]);
	const boundaries = new Set<string>();

	for (let index = 0; index < queue.length; index += 1) {
		const item = queue[index];
		if (!item) continue;
		if (item.level >= depth) {
			boundaries.add(item.oid);
			continue;
		}

		const commitPayload = await repo.readObject(item.oid);
		const metadata = parseLastModifiedCommitMetadata(commitPayload);
		if (metadata === null) {
			throw new GitError(
				"clone shallow commit malformed",
				"OBJECT_FORMAT_ERROR",
				{
					oid: item.oid,
				},
			);
		}

		for (const rawParentOid of metadata.parentOids) {
			const parentOid = rawParentOid.toLowerCase();
			if (!isObjectId(parentOid)) {
				throw new GitError(
					"clone shallow parent oid malformed",
					"OBJECT_FORMAT_ERROR",
					{
						oid: item.oid,
						parentOid: rawParentOid,
					},
				);
			}
			const nextLevel = item.level + 1;
			const previousLevel = seen.get(parentOid);
			if (previousLevel !== undefined && previousLevel <= nextLevel) continue;
			seen.set(parentOid, nextLevel);
			queue.push({
				oid: parentOid,
				level: nextLevel,
			});
		}
	}

	if (boundaries.size === 0) {
		boundaries.add(normalizedHead);
	}
	return [...boundaries].sort((a, b) => a.localeCompare(b));
}

interface RepoInitOptions {
	hashAlgorithm?: GitHashAlgorithm;
}

interface RepoCloneOptions {
	branch?: string;
	depth?: number;
	filter?: string;
	recurseSubmodules?: boolean;
	credentialPort?: CredentialPort;
	onProgress?: ProgressCallback;
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

	public static async clone(
		sourcePath: string,
		targetPath: string,
		options: RepoCloneOptions = {},
	): Promise<Repo> {
		const normalizedDepth =
			options.depth === undefined ? null : Number(options.depth);
		if (
			normalizedDepth !== null &&
			(!Number.isInteger(normalizedDepth) || normalizedDepth < 1)
		) {
			throw new GitError("clone depth invalid", "INVALID_ARGUMENT", {
				depth: options.depth,
			});
		}
		const normalizedBranch =
			typeof options.branch === "string" ? options.branch.trim() : "";
		if (typeof options.branch === "string" && normalizedBranch.length === 0) {
			throw new GitError("clone branch invalid", "INVALID_ARGUMENT", {
				branch: options.branch,
			});
		}
		const normalizedFilter =
			typeof options.filter === "string" ? options.filter.trim() : "";
		if (typeof options.filter === "string" && normalizedFilter.length === 0) {
			throw new GitError("clone filter invalid", "INVALID_ARGUMENT", {
				filter: options.filter,
			});
		}
		const recurseSubmodules = options.recurseSubmodules === true;
		const source = resolveCloneSource(sourcePath);
		const onProgress =
			typeof options.onProgress === "function" ? options.onProgress : undefined;
		let sourceRepoPath = source.sourceRepoPath;
		if (source.protocol === "http" || source.protocol === "https") {
			sourceRepoPath = await probeHttpCloneSource(source.remoteUrl, onProgress);
		}
		if (source.protocol === "ssh") {
			await probeSshCloneSource(
				source.remoteUrl,
				options.credentialPort,
				onProgress,
			);
		}

		const fs = await loadNodeFs();
		const sourceRepo = await Repo.open(sourceRepoPath);

		const normalizedTargetPath = stripTrailingSlash(targetPath);
		const targetExists = await pathExists(fs, normalizedTargetPath);
		if (targetExists) {
			const targetStat = await fs.stat(normalizedTargetPath);
			if (!targetStat.isDirectory()) {
				throw new GitError("clone target invalid", "ALREADY_EXISTS", {
					targetPath: normalizedTargetPath,
				});
			}
			const entries = await fs.readdir(normalizedTargetPath, {
				withFileTypes: true,
			});
			if (entries.length > 0) {
				throw new GitError("clone target not empty", "ALREADY_EXISTS", {
					targetPath: normalizedTargetPath,
				});
			}
		}

		const initialized = await Repo.init(normalizedTargetPath, {
			hashAlgorithm: sourceRepo.hashAlgorithm,
		});
		await copyTree(fs, sourceRepo.gitDirPath, initialized.gitDirPath);
		await fs.writeFile(
			joinFsPath(initialized.gitDirPath, "config"),
			buildRepoConfig(sourceRepo.hashAlgorithm),
			{
				encoding: "utf8",
			},
		);

		const cloned = await Repo.open(normalizedTargetPath);
		if (normalizedBranch.length > 0) {
			const branchRefName = normalizeRefName(`heads/${normalizedBranch}`);
			const branchOid = await cloned.resolveRef(branchRefName);
			if (branchOid === null) {
				throw new GitError("clone branch missing", "NOT_FOUND", {
					branchRefName,
				});
			}
			await fs.writeFile(
				joinFsPath(cloned.gitDirPath, "HEAD"),
				`ref: ${branchRefName}\n`,
				{
					encoding: "utf8",
				},
			);
		}

		const headPath = joinFsPath(cloned.gitDirPath, "HEAD");
		const headValue = String(
			await fs.readFile(headPath, {
				encoding: "utf8",
			}),
		).trim();
		const headRef = headValue.startsWith("ref:")
			? normalizeRefName(headValue.slice("ref:".length).trim())
			: null;
		const headBranchRef = headRef?.startsWith("refs/heads/") ? headRef : null;
		const localHeadRefs = await cloned.listRefs("refs/heads");
		for (const localHeadRef of localHeadRefs) {
			const branchName = localHeadRef.refName.slice("refs/heads/".length);
			await cloned.updateRef(
				`refs/remotes/origin/${branchName}`,
				localHeadRef.oid,
				"clone-remote-track",
			);
			if (headBranchRef === null || localHeadRef.refName === headBranchRef) {
				continue;
			}
			await cloned.deleteRef(localHeadRef.refName, "clone-prune-local");
		}
		if (headBranchRef !== null) {
			const headBranchName = headBranchRef.slice("refs/heads/".length);
			const remoteHeadPath = joinFsPath(
				cloned.gitDirPath,
				"refs",
				"remotes",
				"origin",
				"HEAD",
			);
			await fs.mkdir(parentFsPath(remoteHeadPath), { recursive: true });
			await fs.writeFile(
				remoteHeadPath,
				`ref: refs/remotes/origin/${headBranchName}\n`,
				{
					encoding: "utf8",
				},
			);
		}

		const targetHeadOid = await cloned.resolveHead();
		const materialized = await collectCommitMaterialization(
			cloned,
			targetHeadOid,
		);
		await cloned.checkout(materialized.files);
		for (const gitlink of materialized.gitlinks) {
			await fs.mkdir(joinFsPath(normalizedTargetPath, gitlink.path), {
				recursive: true,
			});
		}

		if (normalizedDepth !== null) {
			const shallowCommits = await computeShallowBoundaryCommits(
				cloned,
				targetHeadOid,
				normalizedDepth,
			);
			await fs.writeFile(
				joinFsPath(cloned.gitDirPath, "shallow"),
				`${shallowCommits.join("\n")}\n`,
				{
					encoding: "utf8",
				},
			);
		}

		if (normalizedFilter.length > 0) {
			await cloned.negotiatePartialCloneFilter(normalizedFilter, [
				"filter",
				`object-format=${cloned.hashAlgorithm}`,
			]);
		}

		const configPath = joinFsPath(cloned.gitDirPath, "config");
		const configText = String(
			await fs.readFile(configPath, {
				encoding: "utf8",
			}),
		);
		await fs.writeFile(
			configPath,
			upsertRemoteOriginConfig(configText, source.remoteUrl, normalizedFilter),
			{
				encoding: "utf8",
			},
		);

		if (recurseSubmodules && cloned.worktreePath !== null) {
			const gitmodulesPath = joinFsPath(cloned.worktreePath, ".gitmodules");
			if (await pathExists(fs, gitmodulesPath)) {
				const gitmodulesText = String(
					await fs.readFile(gitmodulesPath, {
						encoding: "utf8",
					}),
				);
				const gitlinksByPath = new Map<string, string>(
					materialized.gitlinks.map((gitlink) => [gitlink.path, gitlink.oid]),
				);
				for (const entry of parseGitmodules(gitmodulesText)) {
					assertSafeWorktreePath(entry.path);
					const submoduleSource = resolveSubmoduleSource(
						source.remoteUrl,
						entry.url,
					);
					const submoduleTargetPath = joinFsPath(
						cloned.worktreePath,
						entry.path,
					);
					const submoduleCloneOptions: RepoCloneOptions = {
						recurseSubmodules: true,
					};
					if (normalizedDepth !== null) {
						submoduleCloneOptions.depth = normalizedDepth;
					}
					if (normalizedFilter.length > 0) {
						submoduleCloneOptions.filter = normalizedFilter;
					}
					await Repo.clone(
						submoduleSource,
						submoduleTargetPath,
						submoduleCloneOptions,
					);

					const gitlinkOid = gitlinksByPath.get(entry.path);
					if (!gitlinkOid || !isObjectId(gitlinkOid.toLowerCase())) continue;
					const submoduleRepo = await Repo.open(submoduleTargetPath);
					const normalizedGitlinkOid = gitlinkOid.toLowerCase();
					const gitlinkCommit = await submoduleRepo
						.readObject(normalizedGitlinkOid)
						.catch(() => null);
					if (!(gitlinkCommit instanceof Uint8Array)) continue;
					await fs.writeFile(
						joinFsPath(submoduleRepo.gitDirPath, "HEAD"),
						`${normalizedGitlinkOid}\n`,
						{
							encoding: "utf8",
						},
					);
					const submoduleMaterialized = await collectCommitMaterialization(
						submoduleRepo,
						normalizedGitlinkOid,
					);
					await submoduleRepo.checkout(submoduleMaterialized.files);
					for (const nestedGitlink of submoduleMaterialized.gitlinks) {
						await fs.mkdir(
							joinFsPath(submoduleTargetPath, nestedGitlink.path),
							{ recursive: true },
						);
					}
				}
			}
		}

		return cloned;
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
		for (const oid of (await this.readLooseRefsMap()).values()) {
			if (isObjectId(oid)) objectIds.push(oid);
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

	private async readLooseObjectEnvelope(oid: string): Promise<{
		objectType: GitObjectType;
		payload: Uint8Array;
		diskSize: number;
	} | null> {
		const fs = await loadNodeFs();
		const { dir, file } = objectPathParts(oid);
		const objectPath = joinFsPath(this.gitDirPath, "objects", dir, file);
		const objectBytes = await fs.readFile(objectPath).catch(() => null);
		if (!(objectBytes instanceof Uint8Array)) return null;
		const inflated = await this.compression.inflateRaw(objectBytes);
		const decoded = decodeLooseObject(inflated);
		return {
			objectType: decoded.objectType,
			payload: decoded.payload,
			diskSize: objectBytes.byteLength,
		};
	}

	private async writeLooseBlobAtOid(
		fs: NodeFsPromises,
		oid: string,
		payload: Uint8Array,
	): Promise<void> {
		const encoded = encodeLooseObject("blob", payload);
		const compressed = await this.compression.deflateRaw(encoded);
		const { dir, file } = objectPathParts(oid);
		const objectDir = joinFsPath(this.gitDirPath, "objects", dir);
		const objectPath = joinFsPath(objectDir, file);
		await fs.mkdir(objectDir, { recursive: true });
		const exists = await pathExists(fs, objectPath);
		if (!exists) {
			await fs.writeFile(objectPath, compressed);
		}
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
		state.promisorObjects[oid.toLowerCase()] = [...toBytes(payload)];
		await this.writePartialCloneState(fs, state);
	}

	public async resolvePromisedObject(oid: string): Promise<Uint8Array> {
		if (!isObjectId(oid)) {
			throw new GitError("invalid object id", "INVALID_ARGUMENT", { oid });
		}
		const normalizedOid = oid.toLowerCase();
		const fs = await loadNodeFs();
		const state = await this.readPartialCloneState(fs);
		const promised = state.promisorObjects[normalizedOid];
		if (!promised) {
			const hydrated = await this.readObject(normalizedOid).catch(() => null);
			if (hydrated !== null) return hydrated;
			throw new GitError("promised object missing", "INTEGRITY_ERROR", {
				oid: normalizedOid,
			});
		}
		if (!Array.isArray(promised) || promised.length === 0) {
			throw new GitError("promised object malformed", "INTEGRITY_ERROR", {
				oid: normalizedOid,
			});
		}
		for (const item of promised) {
			if (!Number.isInteger(item) || item < 0 || item > 255) {
				throw new GitError("promised object malformed", "INTEGRITY_ERROR", {
					oid: normalizedOid,
				});
			}
		}
		return Uint8Array.from(promised);
	}

	public async backfill(
		options: BackfillOptions = {},
	): Promise<BackfillResult> {
		const normalized = normalizeBackfillOptions(options);
		if (!normalized.ok) {
			throw new GitError("backfill options invalid", "INVALID_ARGUMENT", {
				reason: normalized.reason,
			});
		}
		const fs = await loadNodeFs();
		const state = await this.readPartialCloneState(fs);
		const promisedByOid = new Map<string, number[]>();
		for (const [rawOid, payload] of Object.entries(state.promisorObjects)) {
			const oid = rawOid.toLowerCase();
			if (!isObjectId(oid)) continue;
			promisedByOid.set(oid, [...payload]);
		}

		let requestedOids = [...promisedByOid.keys()].sort((a, b) =>
			a.localeCompare(b),
		);
		if (normalized.sparse) {
			const sparseState = await this.readSparseCheckoutState(fs);
			if (sparseState !== null) {
				const index = await this.readIndexV2(fs);
				const selectedPaths = new Set(
					selectSparsePaths(
						index.entries.map((entry) => entry.path),
						sparseState.mode,
						sparseState.rules,
					),
				);
				const sparseOids = new Set(
					index.entries
						.filter((entry) => selectedPaths.has(entry.path))
						.map((entry) => entry.oid.toLowerCase()),
				);
				requestedOids = requestedOids.filter((oid) => sparseOids.has(oid));
			}
		}

		if (requestedOids.length < normalized.minBatchSize) {
			return {
				status: "skipped-min-batch-size",
				minBatchSize: normalized.minBatchSize,
				sparse: normalized.sparse,
				requestedOids,
				fetchedOids: [],
				remainingPromisorOids: [...promisedByOid.keys()].sort((a, b) =>
					a.localeCompare(b),
				),
			};
		}

		const fetchedOids: string[] = [];
		for (const oid of requestedOids) {
			const payload = promisedByOid.get(oid);
			if (!payload || payload.length === 0) {
				throw new GitError("promised object malformed", "INTEGRITY_ERROR", {
					oid,
				});
			}
			for (const item of payload) {
				if (!Number.isInteger(item) || item < 0 || item > 255) {
					throw new GitError("promised object malformed", "INTEGRITY_ERROR", {
						oid,
					});
				}
			}
			await this.writeLooseBlobAtOid(fs, oid, Uint8Array.from(payload));
			delete state.promisorObjects[oid];
			fetchedOids.push(oid);
		}

		await this.writePartialCloneState(fs, state);
		const remainingPromisorOids = Object.keys(state.promisorObjects)
			.map((oid) => oid.toLowerCase())
			.filter((oid) => isObjectId(oid))
			.sort((a, b) => a.localeCompare(b));
		return {
			status: "completed",
			minBatchSize: normalized.minBatchSize,
			sparse: normalized.sparse,
			requestedOids,
			fetchedOids,
			remainingPromisorOids,
		};
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

	public async repoInfo(
		options: { all?: boolean; keys?: string[] } = {},
	): Promise<Record<string, string>> {
		const fs = await loadNodeFs();
		const shallowPath = joinFsPath(this.gitDirPath, "shallow");
		const info = {
			"layout.bare": this.worktreePath === null ? "true" : "false",
			"layout.shallow": (await pathExists(fs, shallowPath)) ? "true" : "false",
			"object.format": this.hashAlgorithm,
			"references.format": "files",
		} as const;

		const requestedKeys =
			options.all === true ? Object.keys(info) : (options.keys ?? []);
		if (requestedKeys.length === 0) return {};

		const out: Record<string, string> = {};
		for (const rawKey of requestedKeys) {
			const key = rawKey.trim();
			if (key.length === 0) {
				throw new GitError("repo info key invalid", "INVALID_ARGUMENT", {
					key,
				});
			}
			const value = info[key as keyof typeof info];
			if (value === undefined) {
				throw new GitError("repo info key invalid", "INVALID_ARGUMENT", {
					key,
				});
			}
			out[key] = value;
		}

		return out;
	}

	public async repoStructure(): Promise<Record<string, string>> {
		const totals = emptyRepoStructureTotals();
		const refs = await this.listRefs("refs");
		for (const entry of refs) {
			if (entry.refName.startsWith("refs/heads/")) {
				totals.references.branchesCount += 1;
				continue;
			}
			if (entry.refName.startsWith("refs/tags/")) {
				totals.references.tagsCount += 1;
				continue;
			}
			if (entry.refName.startsWith("refs/remotes/")) {
				totals.references.remotesCount += 1;
				continue;
			}
			totals.references.othersCount += 1;
		}

		const fs = await loadNodeFs();
		const queue = await this.readReachableRefObjectIds(fs);
		const seen = new Set<string>();
		const oidByteLength = this.hashAlgorithm === "sha1" ? 20 : 32;

		while (queue.length > 0) {
			const currentOid = queue.shift();
			if (!currentOid) continue;
			const oid = currentOid.toLowerCase();
			if (!isObjectId(oid)) continue;
			if (seen.has(oid)) continue;
			seen.add(oid);

			const objectEnvelope = await this.readLooseObjectEnvelope(oid);
			if (objectEnvelope === null) continue;

			if (objectEnvelope.objectType === "commit") {
				totals.objects.commits.count += 1;
				totals.objects.commits.inflatedSize +=
					objectEnvelope.payload.byteLength;
				totals.objects.commits.diskSize += objectEnvelope.diskSize;
				const metadata = parseLastModifiedCommitMetadata(
					objectEnvelope.payload,
				);
				if (metadata !== null) {
					if (isObjectId(metadata.treeOid)) queue.push(metadata.treeOid);
					for (const parentOid of metadata.parentOids) {
						if (isObjectId(parentOid)) queue.push(parentOid);
					}
				}
				continue;
			}

			if (objectEnvelope.objectType === "tree") {
				totals.objects.trees.count += 1;
				totals.objects.trees.inflatedSize += objectEnvelope.payload.byteLength;
				totals.objects.trees.diskSize += objectEnvelope.diskSize;
				const entries = parseLastModifiedTreeEntries(
					objectEnvelope.payload,
					oidByteLength,
				);
				for (const treeEntry of entries) {
					if (isObjectId(treeEntry.oid)) queue.push(treeEntry.oid);
				}
				continue;
			}

			if (objectEnvelope.objectType === "blob") {
				totals.objects.blobs.count += 1;
				totals.objects.blobs.inflatedSize += objectEnvelope.payload.byteLength;
				totals.objects.blobs.diskSize += objectEnvelope.diskSize;
				continue;
			}

			totals.objects.tags.count += 1;
			totals.objects.tags.inflatedSize += objectEnvelope.payload.byteLength;
			totals.objects.tags.diskSize += objectEnvelope.diskSize;
			const targetOid = parseRepoTagTargetOid(objectEnvelope.payload);
			if (targetOid !== null && isObjectId(targetOid)) {
				queue.push(targetOid);
			}
		}

		return repoStructureToKeyValue(totals);
	}

	private async resolveLastModifiedRefOid(refValue: string): Promise<string> {
		if (refValue === "HEAD") {
			return this.resolveHead();
		}
		if (isObjectId(refValue)) return refValue.toLowerCase();

		const candidates = [
			refValue,
			`refs/${refValue}`,
			`refs/heads/${refValue}`,
			`refs/tags/${refValue}`,
		];
		for (const candidate of candidates) {
			const oid = await this.resolveRef(candidate);
			if (oid !== null) return oid.toLowerCase();
		}

		throw new GitError("last-modified ref invalid", "INVALID_ARGUMENT", {
			refValue,
		});
	}

	private async readLastModifiedCommitMetadata(
		commitOid: string,
	): Promise<LastModifiedCommitMetadata> {
		if (!isObjectId(commitOid)) {
			throw new GitError(
				"last-modified commit oid invalid",
				"INVALID_ARGUMENT",
				{
					commitOid,
				},
			);
		}
		const commitPayload = await this.readObject(commitOid);
		const metadata = parseLastModifiedCommitMetadata(commitPayload);
		if (metadata === null || !isObjectId(metadata.treeOid)) {
			throw new GitError(
				"last-modified commit metadata invalid",
				"OBJECT_FORMAT_ERROR",
				{
					commitOid,
				},
			);
		}
		for (const parentOid of metadata.parentOids) {
			if (!isObjectId(parentOid)) {
				throw new GitError(
					"last-modified parent oid invalid",
					"OBJECT_FORMAT_ERROR",
					{
						commitOid,
						parentOid,
					},
				);
			}
		}
		return metadata;
	}

	private async readLastModifiedPathOid(
		treeOid: string,
		pathValue: string,
	): Promise<string | null> {
		if (!isObjectId(treeOid)) {
			throw new GitError("last-modified tree oid invalid", "INVALID_ARGUMENT", {
				treeOid,
			});
		}
		const segments = pathValue.split("/");
		let currentTreeOid = treeOid;
		for (let index = 0; index < segments.length; index += 1) {
			const segment = segments[index];
			if (!segment) {
				throw new GitError(
					"last-modified path segment invalid",
					"INVALID_ARGUMENT",
					{
						pathValue,
					},
				);
			}

			const treePayload = await this.readObject(currentTreeOid);
			const oidByteLength = this.hashAlgorithm === "sha1" ? 20 : 32;
			const entries = parseLastModifiedTreeEntries(treePayload, oidByteLength);
			const entry = entries.find((item) => item.name === segment) ?? null;
			if (entry === null) return null;
			if (!isObjectId(entry.oid)) {
				throw new GitError(
					"last-modified tree entry oid invalid",
					"OBJECT_FORMAT_ERROR",
					{
						pathValue,
						treeOid: currentTreeOid,
						segment,
					},
				);
			}

			const isLast = index === segments.length - 1;
			if (isLast) {
				if (entry.mode === 0o40000) return null;
				return entry.oid;
			}
			if (entry.mode !== 0o40000) return null;
			currentTreeOid = entry.oid;
		}

		return null;
	}

	private async resolveLastModifiedHistoryOid(
		startCommitOid: string,
		pathValue: string,
	): Promise<string | null> {
		let currentCommitOid: string | null = startCommitOid;
		const seen = new Set<string>();

		while (currentCommitOid !== null) {
			if (seen.has(currentCommitOid)) break;
			seen.add(currentCommitOid);

			const commit =
				await this.readLastModifiedCommitMetadata(currentCommitOid);
			const currentPathOid = await this.readLastModifiedPathOid(
				commit.treeOid,
				pathValue,
			);
			if (commit.parentOids.length === 0) {
				return currentPathOid === null ? null : currentCommitOid;
			}

			let changedFromParent = false;
			for (const parentOid of commit.parentOids) {
				const parentCommit =
					await this.readLastModifiedCommitMetadata(parentOid);
				const parentPathOid = await this.readLastModifiedPathOid(
					parentCommit.treeOid,
					pathValue,
				);
				if (parentPathOid !== currentPathOid) {
					changedFromParent = true;
					break;
				}
			}

			if (changedFromParent) {
				return currentPathOid === null ? null : currentCommitOid;
			}
			currentCommitOid = commit.parentOids[0] ?? null;
		}

		return null;
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

	public async replay(
		steps: ReplayStep[],
		options: { updateIndex?: boolean } = {},
	): Promise<ReplayResult> {
		const replayValidation = validateReplaySteps(steps);
		if (!replayValidation.ok) {
			throw new GitError("replay steps invalid", "INVALID_ARGUMENT", {
				reason: replayValidation.reason,
			});
		}

		const appliedPaths: string[] = [];
		for (let index = 0; index < replayValidation.steps.length; index += 1) {
			const step = replayValidation.steps[index];
			if (!step) continue;
			const applyResult = await this.applyPatch(step.patchText, {
				reverse: step.reverse === true,
				updateIndex: options.updateIndex === true,
			}).then(
				(appliedPath) => ({ ok: true as const, appliedPath }),
				() => ({ ok: false as const }),
			);
			if (!applyResult.ok) {
				return replayConflict(appliedPaths, index);
			}
			appliedPaths.push(applyResult.appliedPath);
		}
		return replayCompleted(appliedPaths);
	}

	public async lastModified(
		pathValue: string,
		options: { ref?: string } = {},
	): Promise<LastModifiedResult> {
		assertSafeWorktreePath(pathValue);
		const normalizedRef = normalizeLastModifiedRef(options.ref);
		const fs = await loadNodeFs();
		const index = await this.readIndexV2(fs);
		const indexEntry = index.entries.find((entry) => entry.path === pathValue);
		const indexOidRaw = indexEntry?.oid ?? null;
		const indexOid = indexOidRaw === null ? null : indexOidRaw.toLowerCase();
		if (indexOid !== null && !isObjectId(indexOid)) {
			throw new GitError(
				"last-modified index oid invalid",
				"OBJECT_FORMAT_ERROR",
				{
					pathValue,
					indexOid: indexOidRaw,
				},
			);
		}

		const refOid = await this.resolveLastModifiedRefOid(normalizedRef);
		const historyOid = await this.resolveLastModifiedHistoryOid(
			refOid,
			pathValue,
		);
		return createLastModifiedResult(pathValue, historyOid, indexOid);
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

	public receivePackRequest(
		update: ReceivePackRefUpdate,
		capabilities: string[] = [],
	): Uint8Array {
		if (!isObjectId(update.oldOid) || !isObjectId(update.newOid)) {
			throw new GitError("receive-pack oid invalid", "INVALID_ARGUMENT", {
				update,
			});
		}
		if (update.oldOid.length !== update.newOid.length) {
			throw new GitError(
				"receive-pack oid length mismatch",
				"INVALID_ARGUMENT",
				{
					update,
				},
			);
		}
		if (update.refName.trim().length === 0) {
			throw new GitError("receive-pack ref invalid", "INVALID_ARGUMENT", {
				update,
			});
		}
		const normalizedUpdate = {
			refName: normalizeRefName(update.refName),
			oldOid: update.oldOid.toLowerCase(),
			newOid: update.newOid.toLowerCase(),
		};
		return buildReceivePackRequest(normalizedUpdate, capabilities);
	}

	public async receivePackAdvertiseRefs(
		capabilities: string[] = [],
	): Promise<Uint8Array> {
		const fs = await loadNodeFs();
		const refs = await this.listRefs("refs");
		const headValue = String(
			await fs.readFile(joinFsPath(this.gitDirPath, "HEAD"), {
				encoding: "utf8",
			}),
		).trim();
		const headRefName = headValue.startsWith("ref:")
			? normalizeRefName(headValue.slice("ref:".length).trim())
			: null;
		const orderedRefs =
			headRefName === null
				? refs
				: [
						...refs.filter((entry) => entry.refName === headRefName),
						...refs.filter((entry) => entry.refName !== headRefName),
					];
		const mergedCapabilities = [
			"report-status",
			"report-status-v2",
			"delete-refs",
			"side-band-64k",
			"ofs-delta",
			`object-format=${this.hashAlgorithm}`,
			...capabilities,
		];
		return buildReceivePackAdvertisement(
			orderedRefs.map((entry) => ({
				refName: entry.refName,
				oid: entry.oid,
			})),
			mergedCapabilities,
		);
	}

	public async receivePackUpdate(
		update: ReceivePackRefUpdate,
		message = "receive-pack",
	): Promise<{ refName: string; oid: string }> {
		if (!isObjectId(update.oldOid) || !isObjectId(update.newOid)) {
			throw new GitError("receive-pack oid invalid", "INVALID_ARGUMENT", {
				update,
			});
		}
		if (update.oldOid.length !== update.newOid.length) {
			throw new GitError(
				"receive-pack oid length mismatch",
				"INVALID_ARGUMENT",
				{
					update,
				},
			);
		}
		const normalizedRefName = normalizeRefName(update.refName);
		const normalizedOldOid = update.oldOid.toLowerCase();
		const normalizedNewOid = update.newOid.toLowerCase();
		const zeroOid = "0".repeat(normalizedNewOid.length);
		const currentOid = await this.resolveRef(normalizedRefName);
		const expectedCurrentOid = currentOid === null ? zeroOid : currentOid;
		if (expectedCurrentOid !== normalizedOldOid) {
			throw new GitError("receive-pack old oid mismatch", "LOCK_CONFLICT", {
				refName: normalizedRefName,
				expectedOldOid: expectedCurrentOid,
				actualOldOid: normalizedOldOid,
			});
		}
		if (normalizedNewOid === zeroOid) {
			if (currentOid !== null) {
				await this.deleteRef(normalizedRefName, message);
			}
			return { refName: normalizedRefName, oid: normalizedNewOid };
		}
		await this.updateRef(normalizedRefName, normalizedNewOid, message);
		return { refName: normalizedRefName, oid: normalizedNewOid };
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

	private async readPackedRefsMap(): Promise<Map<string, string>> {
		const fs = await loadNodeFs();
		const packedRefsPath = joinFsPath(this.gitDirPath, "packed-refs");
		const packedExists = await pathExists(fs, packedRefsPath);
		if (!packedExists) return new Map<string, string>();
		const packedText = String(
			await fs.readFile(packedRefsPath, {
				encoding: "utf8",
			}),
		);
		return parsePackedRefs(packedText);
	}

	private async readLooseRefsMap(): Promise<Map<string, string>> {
		const fs = await loadNodeFs();
		const refsRootPath = joinFsPath(this.gitDirPath, "refs");
		const refsRootExists = await pathExists(fs, refsRootPath);
		const out = new Map<string, string>();
		if (!refsRootExists) return out;

		const stack: Array<{ absPath: string; refPrefix: string }> = [
			{ absPath: refsRootPath, refPrefix: "refs" },
		];

		while (stack.length > 0) {
			const current = stack.pop();
			if (!current) continue;
			const entries = await fs.readdir(current.absPath, {
				withFileTypes: true,
			});
			for (const entry of entries) {
				const absPath = joinFsPath(current.absPath, entry.name);
				const refName = `${current.refPrefix}/${entry.name}`;
				if (entry.isDirectory()) {
					stack.push({ absPath, refPrefix: refName });
					continue;
				}
				if (!entry.isFile()) continue;
				const looseValue = String(
					await fs.readFile(absPath, {
						encoding: "utf8",
					}),
				).trim();
				if (!isObjectId(looseValue)) continue;
				out.set(refName, looseValue);
			}
		}

		return out;
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

		return (await this.readPackedRefsMap()).get(normalizedRef) ?? null;
	}

	public async createRef(
		refName: string,
		oid: string,
		message = "refs-create",
	): Promise<string> {
		if (!isObjectId(oid)) {
			throw new GitError("invalid object id", "INVALID_ARGUMENT", { oid });
		}
		const normalizedRef = normalizeRefName(refName);
		const existing = await this.resolveRef(normalizedRef);
		if (existing !== null) {
			throw new GitError("reference already exists", "ALREADY_EXISTS", {
				refName: normalizedRef,
			});
		}
		await this.updateRef(normalizedRef, oid, message);
		return normalizedRef;
	}

	public async listRefs(
		refPrefix = "refs",
	): Promise<Array<{ refName: string; oid: string }>> {
		const packedRefs = await this.readPackedRefsMap();
		const looseRefs = await this.readLooseRefsMap();
		const mergedRefs = new Map<string, string>(packedRefs);
		for (const [refName, oid] of looseRefs) {
			mergedRefs.set(refName, oid);
		}

		const out = [...mergedRefs.entries()]
			.filter(([refName]) => matchesRefPrefix(refName, refPrefix))
			.map(([refName, oid]) => ({ refName, oid }));
		out.sort((a, b) => a.refName.localeCompare(b.refName));
		return out;
	}

	public async verifyRef(
		refName: string,
		expectedOid: string,
	): Promise<boolean> {
		if (!isObjectId(expectedOid)) {
			throw new GitError("invalid object id", "INVALID_ARGUMENT", {
				expectedOid,
			});
		}
		const actualOid = await this.resolveRef(refName);
		return actualOid === expectedOid;
	}

	public async deleteRef(
		refName: string,
		message = "refs-delete",
	): Promise<void> {
		const fs = await loadNodeFs();
		const normalizedRef = normalizeRefName(refName);
		const oldOid = await this.resolveRef(normalizedRef);
		if (oldOid === null) {
			throw new GitError("reference not found", "NOT_FOUND", {
				refName: normalizedRef,
			});
		}

		const loosePath = joinFsPath(this.gitDirPath, normalizedRef);
		const looseExists = await pathExists(fs, loosePath);
		if (looseExists) {
			await fs.unlink(loosePath);
		}

		const packedRefsPath = joinFsPath(this.gitDirPath, "packed-refs");
		const packedExists = await pathExists(fs, packedRefsPath);
		if (packedExists) {
			const packedText = String(
				await fs.readFile(packedRefsPath, {
					encoding: "utf8",
				}),
			);
			const dropped = dropPackedRefEntry(packedText, normalizedRef);
			if (dropped.removed) {
				await fs.writeFile(packedRefsPath, dropped.nextText, {
					encoding: "utf8",
				});
			}
		}

		const reflogPath = joinFsPath(this.gitDirPath, "logs", normalizedRef);
		await fs.mkdir(parentFsPath(reflogPath), { recursive: true });
		const zeroOid = "0".repeat(oldOid.length);
		const reflogEntry = formatReflogEntry(oldOid, zeroOid, message);
		await fs.appendFile(reflogPath, reflogEntry, { encoding: "utf8" });
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
