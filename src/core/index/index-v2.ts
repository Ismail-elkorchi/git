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

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
	return (
		((bytes[offset] || 0) << 24) |
		((bytes[offset + 1] || 0) << 16) |
		((bytes[offset + 2] || 0) << 8) |
		(bytes[offset + 3] || 0)
	);
}

function bytesToHex(bytes: Uint8Array): string {
	let out = "";
	for (const byteValue of bytes) {
		out += byteValue.toString(16).padStart(2, "0");
	}
	return out;
}

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

function decodeCustomIndexV2(rawIndex: Uint8Array): GitIndexV2 {
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

function decodeNativeIndexV2WithHashLength(
	rawIndex: Uint8Array,
	hashByteLength: number,
): GitIndexV2 | null {
	const entriesEnd = rawIndex.byteLength - hashByteLength;
	if (entriesEnd <= 12) return null;

	const entryCount = readUint32BigEndian(rawIndex, 8);
	const fixedEntryBytes = 42 + hashByteLength;
	const normalizedEntries: IndexEntryV2[] = [];
	let cursor = 12;

	for (let i = 0; i < entryCount; i += 1) {
		if (cursor + fixedEntryBytes > entriesEnd) return null;
		const mode = readUint32BigEndian(rawIndex, cursor + 24);
		const oidStart = cursor + 40;
		const oidEnd = oidStart + hashByteLength;
		const nameStart = cursor + fixedEntryBytes;
		const nameEnd = rawIndex.indexOf(0x00, nameStart);
		if (nameEnd < 0 || nameEnd >= entriesEnd) return null;

		const path = textDecoder.decode(rawIndex.subarray(nameStart, nameEnd));
		if (path.length === 0) return null;
		normalizedEntries.push({
			path,
			oid: bytesToHex(rawIndex.subarray(oidStart, oidEnd)),
			mode,
		});

		const entryLength = nameEnd - cursor + 1;
		cursor += (entryLength + 7) & ~7;
	}

	while (cursor < entriesEnd) {
		if (cursor + 8 > entriesEnd) return null;
		const extensionSize = readUint32BigEndian(rawIndex, cursor + 4);
		cursor += 8 + extensionSize;
	}
	if (cursor !== entriesEnd) return null;

	return {
		version: 2,
		entries: normalizedEntries.sort((a, b) => a.path.localeCompare(b.path)),
	};
}

export function decodeIndexV2(rawIndex: Uint8Array): GitIndexV2 {
	const header = rawIndex.subarray(0, INDEX_HEADER.byteLength);
	for (let i = 0; i < INDEX_HEADER.byteLength; i += 1) {
		if (header[i] !== INDEX_HEADER[i]) throw new Error("index header mismatch");
	}
	if (rawIndex.byteLength < 12) throw new Error("index payload invalid");

	if (rawIndex[INDEX_HEADER.byteLength] === 0x7b) {
		return decodeCustomIndexV2(rawIndex);
	}

	const decodedSha1 = decodeNativeIndexV2WithHashLength(rawIndex, 20);
	if (decodedSha1) return decodedSha1;
	const decodedSha256 = decodeNativeIndexV2WithHashLength(rawIndex, 32);
	if (decodedSha256) return decodedSha256;
	throw new Error("index payload invalid");
}
