export interface MaintenanceStage {
	stage: "gc" | "repack" | "prune";
	message: string;
}

export function maintenanceStages(): MaintenanceStage[] {
	return [
		{ stage: "gc", message: "gc stage complete" },
		{ stage: "repack", message: "repack stage complete" },
		{ stage: "prune", message: "prune stage complete" },
	];
}

export function normalizeObjectIds(objectIds: string[]): string[] {
	const unique = new Set<string>();
	for (const oid of objectIds) {
		if (/^[0-9a-f]{40}$|^[0-9a-f]{64}$/i.test(oid)) {
			unique.add(oid.toLowerCase());
		}
	}
	return [...unique].sort((a, b) => a.localeCompare(b));
}
