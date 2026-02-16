export interface StashEntry {
	id: string;
	message: string;
	treeOid: string;
}

export function normalizeStash(entries: StashEntry[]): StashEntry[] {
	return entries.map((entry, index) => ({
		...entry,
		id: `stash@{${index}}`,
	}));
}

export function addStashEntry(
	entries: StashEntry[],
	message: string,
	treeOid: string,
): StashEntry[] {
	const next = [{ id: "stash@{0}", message, treeOid }, ...entries];
	return normalizeStash(next);
}

export function dropStashEntry(
	entries: StashEntry[],
	id: string,
): StashEntry[] {
	return normalizeStash(entries.filter((entry) => entry.id !== id));
}
