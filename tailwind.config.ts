import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: "#FBF9F5",
          secondary: "#F4F0EA",
          card: "#FFFFFF",
        },
        charcoal: {
          DEFAULT: "#1F1F1F",
          muted: "#57534E",
        },
        vermillion: {
          DEFAULT: "#E03E2F",
          hover: "#C4321A",
        },
        rule: "#E6E2DA",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Newsreader", "Lora", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Inter", "Plus Jakarta Sans", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
