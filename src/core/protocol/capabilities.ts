function normalizeCapability(capability: string): string {
	return capability.trim();
}

export function negotiateCapabilityParity(
	httpCapabilities: string[],
	sshCapabilities: string[],
): string[] {
	const httpSet = new Set(
		httpCapabilities
			.map((capability) => normalizeCapability(capability))
			.filter((capability) => capability.length > 0),
	);
	const sshSet = new Set(
		sshCapabilities
			.map((capability) => normalizeCapability(capability))
			.filter((capability) => capability.length > 0),
	);
	const parity: string[] = [];
	for (const capability of httpSet) {
		if (sshSet.has(capability)) parity.push(capability);
	}
	parity.sort((a, b) => a.localeCompare(b));
	return parity;
}
