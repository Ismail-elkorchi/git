export interface PartialCloneState {
	filterSpec: string | null;
	capabilities: string[];
	promisorObjects: Record<string, number[]>;
}

export const defaultPartialCloneState: PartialCloneState = {
	filterSpec: null,
	capabilities: [],
	promisorObjects: {},
};

function normalizeCapability(capability: string): string {
	return capability.trim();
}

export function negotiatePartialCloneFilter(
	requestedFilter: string,
	capabilities: string[],
): string {
	const normalizedFilter = requestedFilter.trim();
	if (normalizedFilter.length === 0) {
		throw new Error("partial clone filter is empty");
	}
	const normalizedCapabilities = capabilities
		.map((capability) => normalizeCapability(capability))
		.filter((capability) => capability.length > 0);
	const filterSupported = normalizedCapabilities.some(
		(capability) => capability === "filter" || capability.startsWith("filter="),
	);
	if (!filterSupported) {
		throw new Error("partial clone filter capability missing");
	}
	return normalizedFilter;
}

function isUint8Item(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= 0 &&
		value <= 255
	);
}

export function isValidPromisedPayload(value: unknown): value is number[] {
	if (!Array.isArray(value)) return false;
	for (const item of value) {
		if (!isUint8Item(item)) return false;
	}
	return true;
}

export function normalizePartialCloneState(
	value: unknown,
): PartialCloneState | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	const record = value as Record<string, unknown>;
	const filterSpec =
		typeof record.filterSpec === "string" || record.filterSpec === null
			? record.filterSpec
			: null;
	const capabilities = Array.isArray(record.capabilities)
		? record.capabilities.filter(
				(item): item is string => typeof item === "string",
			)
		: [];
	const rawPromisor = record.promisorObjects;
	if (
		!rawPromisor ||
		typeof rawPromisor !== "object" ||
		Array.isArray(rawPromisor)
	) {
		return {
			filterSpec,
			capabilities,
			promisorObjects: {},
		};
	}
	const promisorObjects: Record<string, number[]> = {};
	for (const [oid, payload] of Object.entries(rawPromisor)) {
		if (!isValidPromisedPayload(payload)) {
			return null;
		}
		promisorObjects[oid] = [...payload];
	}
	return {
		filterSpec,
		capabilities,
		promisorObjects,
	};
}
