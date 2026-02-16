import { assertSafeWorktreePath } from "../checkout/path-safety.js";

export interface AppliedPatch {
	filePath: string;
	nextText: string;
}

export function parseUnifiedPatch(patchText: string): {
	filePath: string;
	addedLines: string[];
	removedLines: string[];
} {
	const lines = patchText.replace(/\r\n/g, "\n").split("\n");
	const plusLine = lines.find((line) => line.startsWith("+++ b/"));
	if (!plusLine) throw new Error("patch +++ line missing");
	const filePath = plusLine.slice("+++ b/".length).trim();
	assertSafeWorktreePath(filePath);

	const addedLines: string[] = [];
	const removedLines: string[] = [];
	for (const line of lines) {
		if (line.startsWith("--- ")) continue;
		if (line.startsWith("+++ ")) continue;
		if (line.startsWith("@@")) continue;
		if (line.startsWith("+")) addedLines.push(line.slice(1));
		if (line.startsWith("-")) removedLines.push(line.slice(1));
	}

	return { filePath, addedLines, removedLines };
}

export function applyUnifiedPatch(
	patchText: string,
	reverse: boolean,
): AppliedPatch {
	const parsed = parseUnifiedPatch(patchText);
	const nextLines = reverse ? parsed.removedLines : parsed.addedLines;
	return {
		filePath: parsed.filePath,
		nextText: nextLines.join("\n"),
	};
}
