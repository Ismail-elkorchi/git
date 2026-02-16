Deno.test("deno entrypoint import", async () => {
	const url = new URL("../../src/deno.ts", import.meta.url);
	const mod = await import(url.href);
	if (!mod) throw new Error("import failed");
});
