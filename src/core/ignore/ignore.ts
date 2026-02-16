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

function normalizePath(pathValue: string): string {
	return pathValue.replaceAll("\\", "/").replace(/^\/+/, "");
}

export function matchesIgnorePattern(
	pathValue: string,
	pattern: string,
): boolean {
	return toPatternRegex(pattern).test(normalizePath(pathValue));
}

export function evaluateIgnorePatterns(
	pathValue: string,
	patterns: string[],
): boolean {
	let ignored = false;
	for (const rawPattern of patterns) {
		const pattern = rawPattern.trim();
		if (pattern.length === 0) continue;
		if (pattern.startsWith("#")) continue;
		const negated = pattern.startsWith("!");
		const candidate = negated ? pattern.slice(1) : pattern;
		if (!matchesIgnorePattern(pathValue, candidate)) continue;
		ignored = !negated;
	}
	return ignored;
}
