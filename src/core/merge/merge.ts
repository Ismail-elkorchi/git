export interface MergeOutcome {
	mode: "fast-forward" | "merge-commit";
	parents: string[];
}

export function computeMergeOutcome(
	currentHead: string,
	targetHead: string,
	allowFastForward: boolean,
): MergeOutcome {
	if (allowFastForward) {
		return {
			mode: "fast-forward",
			parents: [targetHead],
		};
	}
	return {
		mode: "merge-commit",
		parents: [currentHead, targetHead],
	};
}
