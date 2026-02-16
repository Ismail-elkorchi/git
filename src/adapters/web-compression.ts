import {
	assertInflateWithinLimits,
	resolveInflateLimits,
} from "../core/compress/limits.js";
import type {
	CompressionPort,
	InflateLimitsInput,
} from "../ports/compression.js";

async function streamToBytes(
	stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
	const buffer = await new Response(stream).arrayBuffer();
	return new Uint8Array(buffer);
}

function toArrayBufferBackedBytes(
	payload: Uint8Array,
): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(new ArrayBuffer(payload.byteLength));
	out.set(payload);
	return out;
}

export class WebCompressionAdapter implements CompressionPort {
	public async deflateRaw(payload: Uint8Array): Promise<Uint8Array> {
		const stream = new Blob([toArrayBufferBackedBytes(payload)]).stream();
		const compressedStream = stream.pipeThrough(
			new CompressionStream("deflate-raw"),
		);
		return streamToBytes(compressedStream);
	}

	public async inflateRaw(
		payload: Uint8Array,
		limitsInput: InflateLimitsInput = {},
	): Promise<Uint8Array> {
		const limits = resolveInflateLimits(limitsInput);
		const stream = new Blob([toArrayBufferBackedBytes(payload)]).stream();
		const inflatedStream = stream.pipeThrough(
			new DecompressionStream("deflate-raw"),
		);
		const inflated = await streamToBytes(inflatedStream);
		assertInflateWithinLimits(payload.byteLength, inflated.byteLength, limits);
		return inflated;
	}
}
