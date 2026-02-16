export interface LastModifiedResult {
	path: string;
	historyOid: string | null;
	indexOid: string | null;
}

export interface LastModifiedCommitMetadata {
	treeOid: string;
	parentOids: string[];
}

export interface LastModifiedTreeEntry {
	mode: number;
	name: string;
	oid: string;
}

const textDecoder = new TextDecoder();

export function normalizeLastModifiedRef(refValue: string | undefined): string {
	if (refValue === undefined) return "HEAD";
	const normalized = refValue.trim();
	if (normalized.length === 0) {
		throw new Error("last-modified ref is empty");
	}
	return normalized;
}

export function createLastModifiedResult(
	pathValue: string,
	historyOid: string | null,
	indexOid: string | null,
): LastModifiedResult {
	return {
		path: pathValue,
		historyOid,
		indexOid,
	};
}

export function parseLastModifiedIndexOid(stageText: string): string | null {
	const trimmed = stageText.trim();
	if (trimmed.length === 0) return null;
	const firstLine = trimmed.split(/\r?\n/)[0] || "";
	const columns = firstLine.trim().split(/\s+/);
	if (columns.length < 2) return null;
	return columns[1] || null;
}

function bytesToHex(bytes: Uint8Array): string {
	let out = "";
	for (const byteValue of bytes) {
		out += byteValue.toString(16).padStart(2, "0");
	}
	return out;
}

export function parseLastModifiedCommitMetadata(
	payload: Uint8Array,
): LastModifiedCommitMetadata | null {
	const headerText = textDecoder.decode(payload).split("\n\n")[0] || "";
	if (headerText.length === 0) return null;
	let treeOid = "";
	const parentOids: string[] = [];
	for (const line of headerText.split("\n")) {
		if (line.startsWith("tree ")) {
			treeOid = line.slice("tree ".length).trim().toLowerCase();
			continue;
		}
		if (line.startsWith("parent ")) {
			parentOids.push(line.slice("parent ".length).trim().toLowerCase());
		}
	}
	if (treeOid.length === 0) return null;
	return { treeOid, parentOids };
}

export function parseLastModifiedTreeEntries(
	payload: Uint8Array,
	oidByteLength: number,
): LastModifiedTreeEntry[] {
	const entries: LastModifiedTreeEntry[] = [];
	let cursor = 0;

	while (cursor < payload.byteLength) {
		const modeEnd = payload.indexOf(0x20, cursor);
		if (modeEnd < 0) throw new Error("tree mode delimiter missing");
		const nameEnd = payload.indexOf(0x00, modeEnd + 1);
		if (nameEnd < 0) throw new Error("tree name delimiter missing");
		const oidStart = nameEnd + 1;
		const oidEnd = oidStart + oidByteLength;
		if (oidEnd > payload.byteLength) throw new Error("tree oid bytes missing");

		const modeText = textDecoder.decode(payload.subarray(cursor, modeEnd));
		const mode = Number.parseInt(modeText, 8);
		if (!Number.isInteger(mode)) throw new Error("tree mode invalid");
		const name = textDecoder.decode(payload.subarray(modeEnd + 1, nameEnd));
		if (name.length === 0) throw new Error("tree name invalid");

		entries.push({
			mode,
			name,
			oid: bytesToHex(payload.subarray(oidStart, oidEnd)),
		});
		cursor = oidEnd;
	}
	return entries;
}
