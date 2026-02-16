export interface RebaseState {
	originalHead: string;
	onto: string;
	steps: string[];
	currentIndex: number;
	status: "active" | "completed" | "aborted";
}

export function startRebaseState(
	originalHead: string,
	onto: string,
	steps: string[],
): RebaseState {
	return {
		originalHead,
		onto,
		steps: [...steps],
		currentIndex: 0,
		status: "active",
	};
}

export function continueRebaseState(state: RebaseState): RebaseState {
	if (state.status !== "active") return state;
	const nextIndex = state.currentIndex + 1;
	const completed = nextIndex >= state.steps.length;
	return {
		...state,
		currentIndex: nextIndex,
		status: completed ? "completed" : "active",
	};
}

export function abortRebaseState(state: RebaseState): RebaseState {
	return {
		...state,
		status: "aborted",
	};
}
