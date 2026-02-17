import { makePktLine } from "../protocol/pkt-line.js";

export interface ReceivePackRefUpdate {
	refName: string;
	oldOid: string;
	newOid: string;
}

export interface ReceivePackAdvertisedRef {
	refName: string;
	oid: string;
}

const textEncoder = new TextEncoder();
const flushPkt = textEncoder.encode("0000");

function joinChunks(chunks: Uint8Array[]): Uint8Array {
	let length = 0;
	for (const chunk of chunks) length += chunk.byteLength;
	const out = new Uint8Array(length);
	let cursor = 0;
	for (const chunk of chunks) {
		out.set(chunk, cursor);
		cursor += chunk.byteLength;
	}
	return out;
}

function normalizeReceivePackCapabilities(capabilities: string[]): string[] {
	const out = new Set<string>();
	for (const capability of capabilities) {
		const trimmed = capability.trim();
		if (trimmed.length === 0) continue;
		out.add(trimmed);
	}
	return [...out].sort((a, b) => a.localeCompare(b));
}

export function buildReceivePackRequest(
	update: ReceivePackRefUpdate,
	capabilities: string[] = [],
): Uint8Array {
	const normalizedCapabilities = normalizeReceivePackCapabilities(capabilities);
	const line =
		normalizedCapabilities.length === 0
			? `${update.oldOid} ${update.newOid} ${update.refName}\n`
			: `${update.oldOid} ${update.newOid} ${update.refName}\0${normalizedCapabilities.join(" ")}\n`;
	return joinChunks([makePktLine(textEncoder.encode(line)), flushPkt]);
}

export function buildReceivePackAdvertisement(
	refs: ReceivePackAdvertisedRef[],
	capabilities: string[],
): Uint8Array {
	if (refs.length === 0) {
		return flushPkt;
	}
	const normalizedCapabilities = normalizeReceivePackCapabilities(capabilities);
	const chunks: Uint8Array[] = [];
	for (let i = 0; i < refs.length; i += 1) {
		const item = refs[i];
		if (!item) continue;
		const line =
			i === 0
				? `${item.oid} ${item.refName}\0${normalizedCapabilities.join(" ")}\n`
				: `${item.oid} ${item.refName}\n`;
		chunks.push(makePktLine(textEncoder.encode(line)));
	}
	chunks.push(flushPkt);
	return joinChunks(chunks);
}
