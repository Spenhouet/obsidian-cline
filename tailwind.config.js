// /home/spe/obsidian-cline/tailwind.config.js
import plugin from "tailwindcss/plugin";

/** @type {import('tailwindcss').Config} */
export default {
    darkMode: "class", // Crucial for Obsidian theming
    content: [
        "./src/**/*.{html,js,svelte,ts,jsx,tsx}",
    ],
    theme: {
        container: {
            center: true,
            padding: "2rem",
            screens: {
                "2xl": "1400px",
            },
        },
        extend: {
            colors: {
                border: "hsl(var(--border) / <alpha-value>)",
                input: "hsl(var(--input) / <alpha-value>)",
                ring: "hsl(var(--ring) / <alpha-value>)",
                background: "hsl(var(--background) / <alpha-value>)",
                foreground: "hsl(var(--foreground) / <alpha-value>)",
                primary: {
                    DEFAULT: "hsl(var(--primary) / <alpha-value>)",
                    foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
                    foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
                    foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted) / <alpha-value>)",
                    foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent) / <alpha-value>)",
                    foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover) / <alpha-value>)",
                    foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
                },
                card: {
                    DEFAULT: "hsl(var(--card) / <alpha-value>)",
                    foreground: "hsl(var(--card-foreground) / <alpha-value>)",
                },
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            },
            fontFamily: {
                sans: ["var(--font-sans)", "sans-serif"], // Example, ensure --font-sans is defined or use Obsidian's fonts
            },
        },
    },
    plugins: [
        plugin(function ({ addBase }) {
            addBase({
                ":root": {
                    "--background": "0 0% 100%", // Light mode default (white)
                    "--foreground": "224 71.4% 4.1%", // Dark text
                    "--card": "0 0% 100%",
                    "--card-foreground": "224 71.4% 4.1%",
                    "--popover": "0 0% 100%",
                    "--popover-foreground": "224 71.4% 4.1%",
                    "--primary": "220.9 39.3% 11%", // Darker blue/gray
                    "--primary-foreground": "210 20% 98%", // Light text on primary
                    "--secondary": "220 14.3% 95.9%", // Light gray
                    "--secondary-foreground": "220.9 39.3% 11%",
                    "--muted": "220 14.3% 95.9%",
                    "--muted-foreground": "220 8.9% 46.1%", // Muted text
                    "--accent": "220 14.3% 95.9%",
                    "--accent-foreground": "220.9 39.3% 11%",
                    "--destructive": "0 84.2% 60.2%", // Red
                    "--destructive-foreground": "210 20% 98%",
                    "--border": "220 13% 91%", // Light border
                    "--input": "220 13% 91%", // Input background
                    "--ring": "224 71.4% 4.1%", // Ring color (focus)
                    "--radius": "0.5rem",
                    // Obsidian specific variables can be mapped here if needed
                    // For example: '--font-sans': 'var(--font-interface)'
                },
                ".dark": { // Dark mode variables (align with Obsidian dark theme)
                    "--background": "224 71.4% 4.1%", // Dark background
                    "--foreground": "210 20% 98%", // Light text
                    "--card": "224 71.4% 4.1%",
                    "--card-foreground": "210 20% 98%",
                    "--popover": "224 71.4% 4.1%",
                    "--popover-foreground": "210 20% 98%",
                    "--primary": "210 20% 98%", // Light primary text/elements in dark mode
                    "--primary-foreground": "220.9 39.3% 11%", // Dark text on primary
                    "--secondary": "215 27.9% 16.9%", // Darker gray
                    "--secondary-foreground": "210 20% 98%",
                    "--muted": "215 27.9% 16.9%",
                    "--muted-foreground": "217.9 10.6% 64.9%",
                    "--accent": "215 27.9% 16.9%",
                    "--accent-foreground": "210 20% 98%",
                    "--destructive": "0 62.8% 30.6%", // Darker red
                    "--destructive-foreground": "210 20% 98%",
                    "--border": "215 27.9% 16.9%", // Darker border
                    "--input": "215 27.9% 16.9%",
                    "--ring": "210 20% 98%",
                },
            });
            addBase({
                '*': {
                    '@apply border-border': {},
                },
                'body': {
                    // Apply Obsidian's body font if possible, or use shadcn's default
                    // '@apply bg-background text-foreground font-sans': {},
                    // font-feature-settings': "'rlig' 1, 'calt' 1",
                    // In Obsidian, body styles are controlled by the app, so be careful here.
                    // It's better to apply bg-background and text-foreground on your root Svelte components.
                },
            });
        }),
        require("tailwindcss-animate"), // Common plugin for shadcn
    ],
};
