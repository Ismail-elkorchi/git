export interface SignaturePort {
	verify(payload: string, signature: string): Promise<boolean>;
}
