function toAscii(bytes: Uint8Array): string {
	return String.fromCharCode(...bytes);
}

export function assertMultiPackIndexBytes(bytes: Uint8Array): void {
	if (bytes.byteLength < 12) {
		throw new Error("multi-pack-index payload is short");
	}
	const magic = toAscii(bytes.subarray(0, 4));
	if (magic !== "MIDX") {
		throw new Error("multi-pack-index header invalid");
	}
}
