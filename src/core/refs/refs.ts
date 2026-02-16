export function normalizeRefName(refName: string): string {
	const trimmed = refName.trim();
	if (trimmed.startsWith("refs/")) return trimmed;
	return `refs/${trimmed}`;
}

export function parsePackedRefs(packedRefsText: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const rawLine of packedRefsText.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (line.length === 0) continue;
		if (line.startsWith("#")) continue;
		if (line.startsWith("^")) continue;
		const m = line.match(/^([0-9a-f]{40}|[0-9a-f]{64})\s+(\S+)$/);
		if (!m) continue;
		const oid = m[1];
		const refName = m[2];
		if (!oid || !refName) continue;
		out.set(refName, oid);
	}
	return out;
}

export function formatReflogEntry(
	oldOid: string,
	newOid: string,
	message: string,
): string {
	const timestamp = Math.floor(Date.now() / 1000);
	return `${oldOid} ${newOid} repo <repo@example.local> ${timestamp} +0000\t${message}\n`;
}
