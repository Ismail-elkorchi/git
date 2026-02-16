function toAscii(bytes: Uint8Array): string {
	return String.fromCharCode(...bytes);
}

export function assertBitmapBytes(bytes: Uint8Array): void {
	if (bytes.byteLength < 8) {
		throw new Error("bitmap payload is short");
	}
	const magic = toAscii(bytes.subarray(0, 4));
	if (magic !== "BITM") {
		throw new Error("bitmap header invalid");
	}
}

export function normalizePackBaseName(packBaseName: string): string {
	const value = packBaseName.trim();
	if (!/^pack-[0-9a-f]{40,64}$/i.test(value)) {
		throw new Error("pack base name invalid");
	}
	return value.toLowerCase();
}
