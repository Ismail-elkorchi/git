export function parseSmartHttpDiscoveryUrl(urlValue: string): URL {
	const url = new URL(urlValue);
	const query = url.search.startsWith("?") ? url.search.slice(1) : url.search;
	const params =
		query.length === 0
			? []
			: query.split("&").filter((value) => value.length > 0);
	if (params.length === 0) {
		throw new Error("smart-http discovery requires service query parameter");
	}
	if (params.length !== 1) {
		throw new Error(
			"smart-http discovery requires exactly one query parameter",
		);
	}
	const serviceParam = url.searchParams.get("service");
	if (!serviceParam || serviceParam.trim().length === 0) {
		throw new Error("smart-http discovery requires service query parameter");
	}
	return url;
}
