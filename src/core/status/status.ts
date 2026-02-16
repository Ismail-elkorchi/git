export interface RepoStatus {
	staged: string[];
	unstaged: string[];
}

function sortedUnique(values: string[]): string[] {
	return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export function normalizeStatus(
	staged: string[],
	unstaged: string[],
): RepoStatus {
	return {
		staged: sortedUnique(staged),
		unstaged: sortedUnique(unstaged),
	};
}
