export interface BlameTuple {
	startLine: number;
	endLine: number;
	oid: string;
	author: string;
}

export function normalizeBlame(
	blame: BlameTuple[],
	totalLines: number,
): BlameTuple[] {
	const out: BlameTuple[] = [];
	for (const item of blame) {
		if (item.startLine < 1) continue;
		if (item.endLine < item.startLine) continue;
		if (item.endLine > totalLines) continue;
		out.push({ ...item });
	}
	return out.sort((a, b) => a.startLine - b.startLine);
}
