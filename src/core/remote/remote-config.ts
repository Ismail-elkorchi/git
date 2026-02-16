export interface RemoteConfigEntry {
	name: string;
	fetchRefspec: string;
	pushRefspec: string;
}

export function normalizeRemoteConfig(
	entries: RemoteConfigEntry[],
): RemoteConfigEntry[] {
	return [...entries].sort((a, b) => a.name.localeCompare(b.name));
}

export function upsertRemoteConfig(
	entries: RemoteConfigEntry[],
	next: RemoteConfigEntry,
): RemoteConfigEntry[] {
	const without = entries.filter((entry) => entry.name !== next.name);
	return normalizeRemoteConfig([...without, next]);
}
