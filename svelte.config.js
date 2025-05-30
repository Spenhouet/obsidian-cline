import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('svelte/compiler').CompileOptions} */
const config = {
    preprocess: vitePreprocess({
        typescript: { tsconfigFile: './tsconfig.json' }, // Ensures svelte-preprocess uses the same TS settings
        // Aliases will be picked up from tsconfig.json by svelte-preprocess
    }),
    compilerOptions: {
        runes: true, // Ensure runes mode is enabled here as well
    },
};

export default config;


