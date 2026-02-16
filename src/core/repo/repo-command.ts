export interface RepoStructureBucket {
	count: number;
	inflatedSize: number;
	diskSize: number;
}

export interface RepoStructureTotals {
	references: {
		branchesCount: number;
		tagsCount: number;
		remotesCount: number;
		othersCount: number;
	};
	objects: {
		commits: RepoStructureBucket;
		trees: RepoStructureBucket;
		blobs: RepoStructureBucket;
		tags: RepoStructureBucket;
	};
}

const textDecoder = new TextDecoder();

function emptyBucket(): RepoStructureBucket {
	return { count: 0, inflatedSize: 0, diskSize: 0 };
}

export function emptyRepoStructureTotals(): RepoStructureTotals {
	return {
		references: {
			branchesCount: 0,
			tagsCount: 0,
			remotesCount: 0,
			othersCount: 0,
		},
		objects: {
			commits: emptyBucket(),
			trees: emptyBucket(),
			blobs: emptyBucket(),
			tags: emptyBucket(),
		},
	};
}

export function repoStructureToKeyValue(
	totals: RepoStructureTotals,
): Record<string, string> {
	return {
		"references.branches.count": String(totals.references.branchesCount),
		"references.tags.count": String(totals.references.tagsCount),
		"references.remotes.count": String(totals.references.remotesCount),
		"references.others.count": String(totals.references.othersCount),
		"objects.commits.count": String(totals.objects.commits.count),
		"objects.trees.count": String(totals.objects.trees.count),
		"objects.blobs.count": String(totals.objects.blobs.count),
		"objects.tags.count": String(totals.objects.tags.count),
		"objects.commits.inflated_size": String(
			totals.objects.commits.inflatedSize,
		),
		"objects.trees.inflated_size": String(totals.objects.trees.inflatedSize),
		"objects.blobs.inflated_size": String(totals.objects.blobs.inflatedSize),
		"objects.tags.inflated_size": String(totals.objects.tags.inflatedSize),
		"objects.commits.disk_size": String(totals.objects.commits.diskSize),
		"objects.trees.disk_size": String(totals.objects.trees.diskSize),
		"objects.blobs.disk_size": String(totals.objects.blobs.diskSize),
		"objects.tags.disk_size": String(totals.objects.tags.diskSize),
	};
}

export function parseRepoTagTargetOid(payload: Uint8Array): string | null {
	const headerText = textDecoder.decode(payload).split("\n\n")[0] || "";
	if (headerText.length === 0) return null;
	for (const line of headerText.split("\n")) {
		if (line.startsWith("object ")) {
			return line.slice("object ".length).trim().toLowerCase();
		}
	}
	return null;
}
