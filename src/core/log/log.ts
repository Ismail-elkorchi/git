import type { CommitNode } from "../revision-walk/walk.js";

export interface LogMetadata {
	oid: string;
	parent: string | null;
	author: string;
	committer: string;
}

export function buildLogMetadata(
	commits: CommitNode[],
	author: string,
	committer: string,
): LogMetadata[] {
	return commits.map((commit) => ({
		oid: commit.oid,
		parent: commit.parents[0] ?? null,
		author,
		committer,
	}));
}
