export interface CredentialMaterial {
	username: string;
	secret: string;
}

export interface CredentialPort {
	get(url: string): Promise<CredentialMaterial | null>;
}
