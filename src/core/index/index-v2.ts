export interface IndexEntryV2 {
	path: string;
	oid: string;
	mode: number;
}

export interface GitIndexV2 {
	version: 2;
	entries: IndexEntryV2[];
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const INDEX_HEADER = new Uint8Array([
	0x44, 0x49, 0x52, 0x43, 0x00, 0x00, 0x00, 0x02,
]);

export function encodeIndexV2(index: GitIndexV2): Uint8Array {
	const sortedEntries = [...index.entries].sort((a, b) =>
		a.path.localeCompare(b.path),
	);
	const jsonText = JSON.stringify({ version: 2, entries: sortedEntries });
	const payload = textEncoder.encode(jsonText);
	const out = new Uint8Array(INDEX_HEADER.byteLength + payload.byteLength);
	out.set(INDEX_HEADER, 0);
	out.set(payload, INDEX_HEADER.byteLength);
	return out;
}

export function decodeIndexV2(rawIndex: Uint8Array): GitIndexV2 {
	const header = rawIndex.subarray(0, INDEX_HEADER.byteLength);
	for (let i = 0; i < INDEX_HEADER.byteLength; i += 1) {
		if (header[i] !== INDEX_HEADER[i]) {
			throw new Error("index header mismatch");
		}
	}

	const payload = rawIndex.subarray(INDEX_HEADER.byteLength);
	const parsed = JSON.parse(textDecoder.decode(payload));
	if (!parsed || typeof parsed !== "object")
		throw new Error("index payload invalid");
	const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
	const normalizedEntries: IndexEntryV2[] = [];
	for (const entry of entries) {
		if (!entry || typeof entry !== "object") continue;
		const path = typeof entry.path === "string" ? entry.path : "";
		const oid = typeof entry.oid === "string" ? entry.oid : "";
		const mode = Number(entry.mode);
		if (path.length === 0) continue;
		normalizedEntries.push({
			path,
			oid,
			mode: Number.isFinite(mode) ? mode : 33188,
		});
	}

	return {
		version: 2,
		entries: normalizedEntries.sort((a, b) => a.path.localeCompare(b.path)),
	};
}
