export function cherryPickCommitPayload(
	treeOid: string,
	parentOid: string,
): string {
	return `cherry-pick\ntree ${treeOid}\nparent ${parentOid}\n`;
}
