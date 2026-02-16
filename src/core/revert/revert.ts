export function revertCommitPayload(
	treeOid: string,
	parentOid: string,
): string {
	return `revert\ntree ${treeOid}\nparent ${parentOid}\n`;
}
