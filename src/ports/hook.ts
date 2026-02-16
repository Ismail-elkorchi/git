export interface HookInvocation {
	name: string;
	argv: string[];
	stdin: string;
	env: Record<string, string>;
}

export interface HookResult {
	exitCode: number;
	stdout: string;
	stderr: string;
}

export interface HookPort {
	execute(invocation: HookInvocation): Promise<HookResult>;
}
