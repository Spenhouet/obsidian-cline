/// <reference types="svelte" />
/// <reference types="vite/client" />

// Ensure no 'declare module "*.svelte"' exists that would override Svelte's default typing
// and prevent named type exports from .svelte files.
// The Svelte extension and svelte-check should provide the necessary typings
// for .svelte files, allowing for type imports.

declare namespace svelteHTML {
  // HTMLAttributes<HTMLButtonElement>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface HTMLAttributes<T extends EventTarget = any> {
    // If you want to use on:beforeinstallprompt
    onbeforeinstallprompt?: (event: any) => any;
    // If you want to use on:beforematch
    onbeforematch?: (event: any) => any;
    // ... other custom attributes
    [key: `data-${string}`]: any; // Allow any data-* attributes
  }
}
