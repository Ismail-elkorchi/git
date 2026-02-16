export type ConfigScopeName = "system" | "global" | "local" | "worktree";

export interface ConfigScope {
	scope: ConfigScopeName;
	values: Record<string, string>;
}

const precedence: ConfigScopeName[] = ["system", "global", "local", "worktree"];

export function resolveConfig(scopes: ConfigScope[]): Record<string, string> {
	const byScope = new Map<ConfigScopeName, Record<string, string>>();
	for (const item of scopes) byScope.set(item.scope, item.values);

	const out: Record<string, string> = {};
	for (const scopeName of precedence) {
		const values = byScope.get(scopeName);
		if (!values) continue;
		const keys = Object.keys(values).sort((a, b) => a.localeCompare(b));
		for (const key of keys) {
			const value = values[key];
			if (value === undefined) continue;
			out[key] = value;
		}
	}
	return out;
}
