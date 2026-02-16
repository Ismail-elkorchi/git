import { assertSafeWorktreePath } from "../checkout/path-safety.js";

export interface LinkedWorktreeEntry {
	path: string;
	branch: string;
	prunable: boolean;
}

export function normalizeWorktrees(
	entries: LinkedWorktreeEntry[],
): LinkedWorktreeEntry[] {
	return [...entries].sort((a, b) => a.path.localeCompare(b.path));
}

export function upsertWorktree(
	entries: LinkedWorktreeEntry[],
	next: LinkedWorktreeEntry,
): LinkedWorktreeEntry[] {
	assertSafeWorktreePath(next.path);
	const without = entries.filter((entry) => entry.path !== next.path);
	return normalizeWorktrees([...without, next]);
}

export function pruneWorktrees(
	entries: LinkedWorktreeEntry[],
): LinkedWorktreeEntry[] {
	return normalizeWorktrees(entries.filter((entry) => !entry.prunable));
}
