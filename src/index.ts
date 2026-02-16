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

export class Repo {
	public readonly gitDirPath: string;
	public readonly worktreePath: string | null;

	public constructor(gitDirPath: string, worktreePath: string | null = null) {
		this.gitDirPath = gitDirPath;
		this.worktreePath = worktreePath;
	}
}
