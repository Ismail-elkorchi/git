export type HashAlgorithm = "sha1" | "sha256";
export type GitObjectType = "blob" | "tree" | "commit" | "tag";

export interface HashPort {
	hashGitObject(
		objectType: GitObjectType,
		payload: Uint8Array,
		algorithm: HashAlgorithm,
	): Promise<string>;
}
