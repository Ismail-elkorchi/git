export function packFileNames(baseName: string): {
	packFileName: string;
	idxFileName: string;
} {
	const trimmed = baseName.trim();
	if (trimmed.length === 0) throw new Error("pack baseName is required");
	return {
		packFileName: `pack-${trimmed}.pack`,
		idxFileName: `pack-${trimmed}.idx`,
	};
}
