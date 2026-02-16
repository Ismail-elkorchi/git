function splitLines(text: string): string[] {
	if (text.length === 0) return [];
	return text.replace(/\r\n/g, "\n").split("\n");
}

export function generateUnifiedPatch(
	filePath: string,
	beforeText: string,
	afterText: string,
): string {
	const beforeLines = splitLines(beforeText);
	const afterLines = splitLines(afterText);
	const lines: string[] = [];
	lines.push(`--- a/${filePath}`);
	lines.push(`+++ b/${filePath}`);
	lines.push(`@@ -1,${beforeLines.length} +1,${afterLines.length} @@`);
	for (const line of beforeLines) lines.push(`-${line}`);
	for (const line of afterLines) lines.push(`+${line}`);
	return `${lines.join("\n")}\n`;
}
