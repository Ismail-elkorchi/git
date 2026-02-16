export type GitObjectType = "blob" | "tree" | "commit" | "tag";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function encodeLooseObject(
	objectType: GitObjectType,
	payload: Uint8Array,
): Uint8Array {
	const header = textEncoder.encode(`${objectType} ${payload.byteLength}\0`);
	const out = new Uint8Array(header.byteLength + payload.byteLength);
	out.set(header, 0);
	out.set(payload, header.byteLength);
	return out;
}

export function decodeLooseObject(rawObject: Uint8Array): {
	objectType: GitObjectType;
	payload: Uint8Array;
} {
	const nullIndex = rawObject.indexOf(0);
	if (nullIndex < 0) throw new Error("invalid loose object header");
	const header = textDecoder.decode(rawObject.subarray(0, nullIndex));
	const separator = header.indexOf(" ");
	if (separator < 0) throw new Error("invalid loose object type and size");

	const objectType = header.slice(0, separator) as GitObjectType;
	const size = Number(header.slice(separator + 1));
	if (!Number.isInteger(size) || size < 0)
		throw new Error("invalid loose object size");

	const payload = rawObject.subarray(nullIndex + 1);
	if (payload.byteLength !== size)
		throw new Error("loose object size mismatch");
	return { objectType, payload };
}
