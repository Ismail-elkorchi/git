const CRC32_POLYNOMIAL = 0xedb88320;

function buildTable(): Uint32Array {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i += 1) {
		let value = i;
		for (let bit = 0; bit < 8; bit += 1) {
			value =
				(value & 1) === 1 ? (value >>> 1) ^ CRC32_POLYNOMIAL : value >>> 1;
		}
		table[i] = value >>> 0;
	}
	return table;
}

const CRC32_TABLE = buildTable();

export function crc32(data: Uint8Array): number {
	let value = 0xffffffff;
	for (const octet of data) {
		const index = (value ^ octet) & 0xff;
		const tableValue = CRC32_TABLE[index] ?? 0;
		value = (value >>> 8) ^ tableValue;
	}
	return (value ^ 0xffffffff) >>> 0;
}

export function crc32Hex(data: Uint8Array): string {
	return crc32(data).toString(16).padStart(8, "0");
}
