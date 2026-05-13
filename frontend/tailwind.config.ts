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
          bg: "#261f38",
          accent: "#bc5727",
          text: "#efefef",
          surface: "rgba(255,255,255,0.05)",
          border: "rgba(255,255,255,0.10)",
          // legacy tokens kept for auth/dashboard backward compat
          black: "#000000",
          white: "#FFFFFF",
          gray: "#9CA3AF",
          muted: "#4B5563",
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
