import { assertSafeWorktreePath } from "../checkout/path-safety.js";

export interface SubmoduleEntry {
	path: string;
	url: string;
	gitlinkOid: string;
}

export function normalizeSubmodules(
	entries: SubmoduleEntry[],
): SubmoduleEntry[] {
	return [...entries].sort((a, b) => a.path.localeCompare(b.path));
}

export function upsertSubmodule(
	entries: SubmoduleEntry[],
	next: SubmoduleEntry,
): SubmoduleEntry[] {
	assertSafeWorktreePath(next.path);
	const without = entries.filter((entry) => entry.path !== next.path);
	return normalizeSubmodules([...without, next]);
}
