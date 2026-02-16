const textEncoder = new TextEncoder();

export const PKT_LINE_MAX_TOTAL_BYTES = 65520;
export const PKT_LINE_MAX_DATA_BYTES = 65516;

export function parsePktLine(frame: Uint8Array): Uint8Array {
	if (frame.byteLength < 4) throw new Error("pkt-line frame header is short");
	const lengthHex = String.fromCharCode(...frame.subarray(0, 4));
	const totalLength = Number.parseInt(lengthHex, 16);
	if (!Number.isInteger(totalLength))
		throw new Error("pkt-line length header invalid");
	if (totalLength === 0) return new Uint8Array();
	if (totalLength < 4) throw new Error("pkt-line total length invalid");
	const dataLength = totalLength - 4;
	if (dataLength > PKT_LINE_MAX_DATA_BYTES) {
		throw new Error("pkt-line data length limit exceeded");
	}
	if (totalLength > PKT_LINE_MAX_TOTAL_BYTES) {
		throw new Error("pkt-line total length limit exceeded");
	}
	if (frame.byteLength !== totalLength) {
		throw new Error("pkt-line payload length mismatch");
	}
	return frame.subarray(4);
}

export function makePktLine(data: Uint8Array): Uint8Array {
	if (data.byteLength > PKT_LINE_MAX_DATA_BYTES) {
		throw new Error("pkt-line data length limit exceeded");
	}
	const totalLength = data.byteLength + 4;
	const prefix = textEncoder.encode(totalLength.toString(16).padStart(4, "0"));
	const out = new Uint8Array(prefix.byteLength + data.byteLength);
	out.set(prefix, 0);
	out.set(data, prefix.byteLength);
	return out;
}
