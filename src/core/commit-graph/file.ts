function toAscii(bytes: Uint8Array): string {
	return String.fromCharCode(...bytes);
}

export function assertCommitGraphBytes(bytes: Uint8Array): void {
	if (bytes.byteLength < 8) {
		throw new Error("commit-graph payload is short");
	}
	const magic = toAscii(bytes.subarray(0, 4));
	if (magic !== "CGPH") {
		throw new Error("commit-graph header invalid");
	}
}
