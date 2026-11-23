import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	base: "./",
	plugins: [react()],
	root: "src/client",
	build: {
		outDir: "../../dist",
		emptyOutDir: true,
	},
	test: {
		globals: true,
		environment: "node",
		root: ".",
		include: ["src/tests/**/*.test.ts"],
	},
});
