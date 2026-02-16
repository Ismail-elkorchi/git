import { matchesIgnorePattern } from "../ignore/ignore.js";

export type GitAttributeValue = "set" | "unset" | string;

function applyAssignment(
	output: Record<string, GitAttributeValue>,
	assignment: string,
): void {
	if (assignment.startsWith("-")) {
		const key = assignment.slice(1);
		if (key.length > 0) output[key] = "unset";
		return;
	}
	const eqIndex = assignment.indexOf("=");
	if (eqIndex > 0) {
		const key = assignment.slice(0, eqIndex);
		const value = assignment.slice(eqIndex + 1);
		if (key.length > 0) output[key] = value;
		return;
	}
	if (assignment.length > 0) output[assignment] = "set";
}

export function evaluateAttributes(
	pathValue: string,
	rules: string[],
): Record<string, GitAttributeValue> {
	const output: Record<string, GitAttributeValue> = {};
	for (const rawRule of rules) {
		const rule = rawRule.trim();
		if (rule.length === 0) continue;
		if (rule.startsWith("#")) continue;
		const parts = rule.split(/\s+/).filter((part) => part.length > 0);
		const pattern = parts[0];
		if (!pattern) continue;
		if (!matchesIgnorePattern(pathValue, pattern)) continue;
		for (let index = 1; index < parts.length; index += 1) {
			const assignment = parts[index];
			if (!assignment) continue;
			applyAssignment(output, assignment);
		}
	}
	return output;
}
