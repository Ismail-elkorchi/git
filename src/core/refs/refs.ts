export function normalizeRefName(refName: string): string {
	const trimmed = refName.trim();
	if (trimmed.startsWith("refs/")) return trimmed;
	return `refs/${trimmed}`;
}

export function normalizeRefPrefix(refPrefix: string): string {
	const trimmed = refPrefix.trim();
	if (trimmed.length === 0) return "";
	if (trimmed === "refs") return "refs/";
	if (trimmed.startsWith("refs/")) return trimmed;
	return normalizeRefName(trimmed);
}

export function matchesRefPrefix(refName: string, refPrefix: string): boolean {
	const normalizedPrefix = normalizeRefPrefix(refPrefix);
	if (normalizedPrefix.length === 0) return true;
	if (normalizedPrefix.endsWith("/")) {
		return refName.startsWith(normalizedPrefix);
	}
	if (refName === normalizedPrefix) return true;
	return refName.startsWith(`${normalizedPrefix}/`);
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

export function dropPackedRefEntry(
	packedRefsText: string,
	targetRefName: string,
): { nextText: string; removed: boolean } {
	const lines = packedRefsText.split(/\r?\n/);
	const nextLines: string[] = [];
	let removed = false;

	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i] ?? "";
		const trimmed = line.trim();
		const m = trimmed.match(/^([0-9a-f]{40}|[0-9a-f]{64})\s+(\S+)$/);
		if (m && m[2] === targetRefName) {
			removed = true;
			const nextLine = lines[i + 1]?.trim() ?? "";
			if (nextLine.startsWith("^")) {
				i += 1;
			}
			continue;
		}
		nextLines.push(line);
	}

	while (nextLines.length > 0 && nextLines[nextLines.length - 1] === "") {
		nextLines.pop();
	}
	if (nextLines.length === 0) {
		return { nextText: "", removed };
	}

	return { nextText: `${nextLines.join("\n")}\n`, removed };
}
