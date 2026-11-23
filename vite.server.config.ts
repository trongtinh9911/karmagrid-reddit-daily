import { builtinModules } from "node:module";
import { defineConfig } from "vite";

export default defineConfig({
	ssr: {
		noExternal: true,
	},
	build: {
		ssr: "src/server/index.ts",
		outDir: "dist/server",
		emptyOutDir: true,
		target: "node22",
		rollupOptions: {
			output: {
				entryFileNames: "index.js",
				format: "cjs",
			},
			external: [...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
		},
	},
});
