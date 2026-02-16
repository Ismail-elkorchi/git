import { assertSafeWorktreePath } from "../checkout/path-safety.js";

export type SparseCheckoutMode = "cone" | "pattern";

function normalizeRule(rule: string): string {
	const trimmed = rule.trim().replaceAll("\\", "/");
	if (trimmed.length === 0) {
		throw new Error("sparse-checkout rule is empty");
	}
	if (trimmed === ".") return ".";
	const normalized = trimmed.replace(/^\/+/, "").replace(/\/+$/, "");
	assertSafeWorktreePath(normalized);
	return normalized;
}

function pathToSegments(pathValue: string): string[] {
	const normalized = pathValue.replaceAll("\\", "/").replace(/^\/+/, "");
	assertSafeWorktreePath(normalized);
	return normalized.split("/");
}

function matchesCone(pathValue: string, coneRules: string[]): boolean {
	const candidate = pathToSegments(pathValue);
	for (const rule of coneRules) {
		if (rule === ".") return true;
		const ruleSegments = rule.split("/");
		if (ruleSegments.length > candidate.length) continue;
		let matches = true;
		for (let index = 0; index < ruleSegments.length; index += 1) {
			if (candidate[index] !== ruleSegments[index]) {
				matches = false;
				break;
			}
		}
		if (matches) return true;
	}
	return false;
}

function escapeRegexToken(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toPatternRegex(pattern: string): RegExp {
	let out = "^";
	for (let index = 0; index < pattern.length; index += 1) {
		const ch = pattern[index];
		const next = pattern[index + 1];
		if (ch === "*" && next === "*") {
			out += ".*";
			index += 1;
			continue;
		}
		if (ch === "*") {
			out += "[^/]*";
			continue;
		}
		if (ch === "?") {
			out += "[^/]";
			continue;
		}
		out += escapeRegexToken(ch ?? "");
	}
	out += "$";
	return new RegExp(out);
}

function matchesPattern(pathValue: string, rules: string[]): boolean {
	for (const rule of rules) {
		if (toPatternRegex(rule).test(pathValue)) return true;
	}
	return false;
}

export function normalizeSparseRules(rules: string[]): string[] {
	const out = new Set<string>();
	for (const rule of rules) out.add(normalizeRule(rule));
	return [...out].sort((a, b) => a.localeCompare(b));
}

export function selectSparsePaths(
	paths: string[],
	mode: SparseCheckoutMode,
	rules: string[],
): string[] {
	const normalizedRules = normalizeSparseRules(rules);
	const selected = new Set<string>();
	for (const candidate of paths) {
		const normalizedPath = candidate.replaceAll("\\", "/").replace(/^\/+/, "");
		assertSafeWorktreePath(normalizedPath);
		const include =
			mode === "cone"
				? matchesCone(normalizedPath, normalizedRules)
				: matchesPattern(normalizedPath, normalizedRules);
		if (include) selected.add(normalizedPath);
	}
	return [...selected].sort((a, b) => a.localeCompare(b));
}
