export interface BackfillOptions {
	minBatchSize?: number;
	sparse?: boolean;
}

export interface BackfillResult {
	status: "completed" | "skipped-min-batch-size";
	minBatchSize: number;
	sparse: boolean;
	requestedOids: string[];
	fetchedOids: string[];
	remainingPromisorOids: string[];
}

export type NormalizedBackfillOptionsResult =
	| { ok: true; minBatchSize: number; sparse: boolean }
	| { ok: false; reason: string };

export function normalizeBackfillOptions(
	options: BackfillOptions,
): NormalizedBackfillOptionsResult {
	const minBatchSize = options.minBatchSize ?? 1;
	if (
		typeof minBatchSize !== "number" ||
		!Number.isInteger(minBatchSize) ||
		minBatchSize < 0
	) {
		return { ok: false, reason: "min-batch-size invalid" };
	}
	return {
		ok: true,
		minBatchSize,
		sparse: options.sparse === true,
	};
}
