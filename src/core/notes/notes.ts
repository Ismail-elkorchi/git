function isObjectId(value: string): boolean {
	return /^[0-9a-f]{40}$|^[0-9a-f]{64}$/i.test(value);
}

export function normalizeNotesState(
	state: Record<string, string>,
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [targetOid, noteOid] of Object.entries(state)) {
		if (!isObjectId(targetOid)) continue;
		if (!isObjectId(noteOid)) continue;
		out[targetOid.toLowerCase()] = noteOid.toLowerCase();
	}
	return out;
}

export function setNote(
	state: Record<string, string>,
	targetOid: string,
	noteOid: string,
): Record<string, string> {
	if (!isObjectId(targetOid)) {
		throw new Error("notes target oid invalid");
	}
	if (!isObjectId(noteOid)) {
		throw new Error("notes oid invalid");
	}
	const out = normalizeNotesState(state);
	out[targetOid.toLowerCase()] = noteOid.toLowerCase();
	return out;
}

export function dropNote(
	state: Record<string, string>,
	targetOid: string,
): Record<string, string> {
	const out = normalizeNotesState(state);
	delete out[targetOid.toLowerCase()];
	return out;
}
