function isObjectId(value: string): boolean {
	return /^[0-9a-f]{40}$|^[0-9a-f]{64}$/i.test(value);
}

export function normalizeReplaceState(
	state: Record<string, string>,
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [originalOid, replacementOid] of Object.entries(state)) {
		if (!isObjectId(originalOid)) continue;
		if (!isObjectId(replacementOid)) continue;
		out[originalOid.toLowerCase()] = replacementOid.toLowerCase();
	}
	return out;
}

export function setReplace(
	state: Record<string, string>,
	originalOid: string,
	replacementOid: string,
): Record<string, string> {
	if (!isObjectId(originalOid)) {
		throw new Error("replace oid invalid");
	}
	if (!isObjectId(replacementOid)) {
		throw new Error("replacement oid invalid");
	}
	const out = normalizeReplaceState(state);
	out[originalOid.toLowerCase()] = replacementOid.toLowerCase();
	return out;
}
