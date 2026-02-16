export interface InflateLimits {
	maxInflatedBytes: number;
	maxInflateRatio: number;
}

export interface InflateLimitsInput {
	maxInflatedBytes?: number;
	maxInflateRatio?: number;
}

export interface CompressionPort {
	deflateRaw(payload: Uint8Array): Promise<Uint8Array>;
	inflateRaw(
		payload: Uint8Array,
		limits?: InflateLimitsInput,
	): Promise<Uint8Array>;
}
