export interface ReplayStep {
	patchText: string;
	reverse?: boolean;
}

export interface ReplayResult {
	status: "completed" | "conflict";
	appliedPaths: string[];
	failedStep: number | null;
}

export type ReplayValidation =
	| { ok: true; steps: ReplayStep[] }
	| { ok: false; reason: string };

export function validateReplaySteps(steps: ReplayStep[]): ReplayValidation {
	if (!Array.isArray(steps) || steps.length === 0) {
		return { ok: false, reason: "replay steps are empty" };
	}
	const normalized: ReplayStep[] = [];
	for (let index = 0; index < steps.length; index += 1) {
		const step = steps[index];
		if (!step || typeof step !== "object" || Array.isArray(step)) {
			return { ok: false, reason: `replay step invalid ${index}` };
		}
		if (
			typeof step.patchText !== "string" ||
			step.patchText.trim().length === 0
		) {
			return { ok: false, reason: `replay patch text invalid ${index}` };
		}
		normalized.push({
			patchText: step.patchText,
			reverse: step.reverse === true,
		});
	}
	return { ok: true, steps: normalized };
}

export function replayCompleted(appliedPaths: string[]): ReplayResult {
	return {
		status: "completed",
		appliedPaths: [...appliedPaths],
		failedStep: null,
	};
}

export function replayConflict(
	appliedPaths: string[],
	failedStep: number,
): ReplayResult {
	return {
		status: "conflict",
		appliedPaths: [...appliedPaths],
		failedStep,
	};
}
