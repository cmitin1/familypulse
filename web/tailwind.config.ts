import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "#ffffff",
        foreground: "#0f172a",
        muted: "#f1f5f9",
        border: "#e2e8f0",
        primary: "#0f172a",
        "primary-foreground": "#f8fafc"
      }
    }
  },
  plugins: []
};

export default config;
