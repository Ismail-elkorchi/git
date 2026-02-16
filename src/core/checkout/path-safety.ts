function hasWindowsDrivePrefix(pathValue: string): boolean {
	return /^[A-Za-z]:[\\/]/.test(pathValue);
}

export function isSafeWorktreePath(pathValue: string): boolean {
	if (pathValue.length === 0) return false;
	if (pathValue.includes("\0")) return false;
	if (pathValue.startsWith("/")) return false;
	if (pathValue.startsWith("\\")) return false;
	if (hasWindowsDrivePrefix(pathValue)) return false;

	const normalized = pathValue.replaceAll("\\", "/");
	const segments = normalized.split("/");
	for (const segment of segments) {
		if (segment.length === 0) return false;
		if (segment === ".") return false;
		if (segment === "..") return false;
	}
	return true;
}

export function assertSafeWorktreePath(pathValue: string): void {
	if (!isSafeWorktreePath(pathValue)) {
		throw new Error("checkout path escapes worktree root");
	}
}
