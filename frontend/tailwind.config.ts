import type { Config } from "tailwindcss";

export default {
  content: [
    "./routes/**/*.{js,jsx,ts,tsx}",
    "./islands/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#3b82f6",
        secondary: "#10b981",
      },
    },
  },
  plugins: [],
} satisfies Config;
