export type GitHashAlgorithm = "sha1" | "sha256";
export type GitObjectType = "blob" | "tree" | "commit" | "tag";

const textEncoder = new TextEncoder();

function encodeObjectHeader(
	objectType: GitObjectType,
	payloadSize: number,
): Uint8Array {
	return textEncoder.encode(`${objectType} ${payloadSize}\0`);
}

function joinBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
	const out = new Uint8Array(a.byteLength + b.byteLength);
	out.set(a, 0);
	out.set(b, a.byteLength);
	return out;
}

function hexEncode(bytes: Uint8Array): string {
	let out = "";
	for (const value of bytes) out += value.toString(16).padStart(2, "0");
	return out;
}

function digestName(algorithm: GitHashAlgorithm): "SHA-1" | "SHA-256" {
	if (algorithm === "sha1") return "SHA-1";
	return "SHA-256";
}

export async function hashGitObject(
	objectType: GitObjectType,
	payload: Uint8Array,
	algorithm: GitHashAlgorithm,
): Promise<string> {
	const header = encodeObjectHeader(objectType, payload.byteLength);
	const objectBytes = joinBytes(header, payload);
	const digestInput = new Uint8Array(objectBytes.byteLength);
	digestInput.set(objectBytes);
	const digest = await crypto.subtle.digest(digestName(algorithm), digestInput);
	return hexEncode(new Uint8Array(digest));
}
