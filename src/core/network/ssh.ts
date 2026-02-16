export function redactSecret(text: string, secret: string): string {
	if (secret.length === 0) return text;
	return text.split(secret).join("***");
}

export function buildUploadPackLine(remoteUrl: string): string {
	return `upload-pack ${remoteUrl}`;
}

export function buildReceivePackLine(
	remoteUrl: string,
	refspec: string,
): string {
	return `receive-pack ${remoteUrl} ${refspec}`;
}
