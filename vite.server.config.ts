import { defineConfig } from "vite";

export default defineConfig({
	build: {
		ssr: "src/server/index.ts",
		outDir: "dist/server",
		emptyOutDir: false,
		target: "node18",
		rollupOptions: {
			output: {
				entryFileNames: "index.js",
				format: "cjs",
			},
			external: ["@devvit/web/server"],
		},
	},
});
