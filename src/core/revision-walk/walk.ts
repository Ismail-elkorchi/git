export interface CommitNode {
	oid: string;
	parents: string[];
}

export type WalkMode = "topo" | "reverse";

export function walkCommits(
	commits: CommitNode[],
	mode: WalkMode,
): CommitNode[] {
	const sorted = [...commits].sort((a, b) => a.oid.localeCompare(b.oid));
	if (mode === "reverse") return sorted.reverse();
	return sorted;
}
