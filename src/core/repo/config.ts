import type { GitHashAlgorithm } from "../../index.js";

export function buildRepoConfig(hashAlgorithm: GitHashAlgorithm): string {
	if (hashAlgorithm === "sha256") {
		return [
			"[core]",
			"\trepositoryformatversion = 1",
			"\tfilemode = true",
			"\tbare = false",
			"\tlogallrefupdates = true",
			"[extensions]",
			"\tobjectformat = sha256",
			"",
		].join("\n");
	}

	return [
		"[core]",
		"\trepositoryformatversion = 0",
		"\tfilemode = true",
		"\tbare = false",
		"\tlogallrefupdates = true",
		"",
	].join("\n");
}

export function parseRepoObjectFormat(configText: string): GitHashAlgorithm {
	const m = configText.match(/^\s*objectformat\s*=\s*(sha1|sha256)\s*$/im);
	if (!m) return "sha1";
	return m[1] === "sha256" ? "sha256" : "sha1";
}
