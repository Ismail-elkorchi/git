import type { SignaturePort } from "../../ports/signature.js";

export async function verifySignedPayload(
	payload: string,
	signature: string,
	signaturePort: SignaturePort,
): Promise<boolean> {
	if (payload.length === 0) return false;
	if (signature.trim().length === 0) return false;
	return signaturePort.verify(payload, signature);
}
