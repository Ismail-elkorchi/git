import type { HookInvocation, HookPort, HookResult } from "../../ports/hook.js";

export function buildHookInvocation(
	name: string,
	argv: string[],
	stdin: string,
	env: Record<string, string>,
): HookInvocation {
	const stableEnv: Record<string, string> = {};
	const keys = Object.keys(env).sort((a, b) => a.localeCompare(b));
	for (const key of keys) {
		const value = env[key];
		if (value === undefined) continue;
		stableEnv[key] = value;
	}

	return {
		name,
		argv: [...argv],
		stdin,
		env: stableEnv,
	};
}

export async function runHook(
	hookPort: HookPort,
	invocation: HookInvocation,
): Promise<HookResult> {
	return hookPort.execute(invocation);
}
