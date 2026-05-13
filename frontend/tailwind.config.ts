import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cube: {
          bg:           "#15181c",
          "bg-deep":    "#181818",
          blue:         "#325da7",
          orange:       "#f68c06",
          accent:       "#f68c06",   // alias → orange (replaces legacy #bc5727)
          text:         "#f7f7f7",
          white:        "#ffffff",
          surface:      "rgba(255,255,255,0.06)",
          "surface-md": "rgba(255,255,255,0.10)",
          border:       "rgba(255,255,255,0.08)",
          "border-md":  "rgba(255,255,255,0.15)",
          // legacy tokens kept for reference
          black:  "#000000",
          gray:   "#9CA3AF",
          muted:  "#4B5563",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
