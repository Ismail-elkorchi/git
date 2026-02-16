import type {
	InflateLimits,
	InflateLimitsInput,
} from "../../ports/compression.js";

export const DEFAULT_MAX_INFLATED_BYTES = 134_217_728;
export const DEFAULT_MAX_INFLATE_RATIO = 200;
export const DEFAULT_MAX_DELTA_CHAIN_DEPTH = 50;

export function resolveInflateLimits(
	input: InflateLimitsInput = {},
): InflateLimits {
	return {
		maxInflatedBytes: input.maxInflatedBytes ?? DEFAULT_MAX_INFLATED_BYTES,
		maxInflateRatio: input.maxInflateRatio ?? DEFAULT_MAX_INFLATE_RATIO,
	};
}

export function assertInflateWithinLimits(
	compressedBytes: number,
	inflatedBytes: number,
	limits: InflateLimits,
): void {
	if (inflatedBytes > limits.maxInflatedBytes) {
		throw new Error("inflate limit breach maxInflatedBytes");
	}

	const safeCompressedBytes = compressedBytes > 0 ? compressedBytes : 1;
	const ratio = inflatedBytes / safeCompressedBytes;
	if (ratio > limits.maxInflateRatio) {
		throw new Error("inflate limit breach maxInflateRatio");
	}
}
