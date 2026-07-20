import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#e8f4ff",
        muted: "#9aa9c2",
        canvas: "#121721",
        panel: "#1a2231",
        line: "#344055",
        brand: "#4fc3f7",
        sky: "#77d2f5",
        lilac: "#9aa2ff",
        rose: "#ff9fa5",
        mint: "#a7e9d8",
        cyan: "#26d8c8",
        emerald: "#67dfb0",
        amber: "#ffb347",
      },
      boxShadow: {
        panel:
          "0 18px 48px rgba(4, 9, 17, 0.24), inset 0 1px rgba(255, 255, 255, 0.05)",
      },
      borderRadius: {
        md: "12px",
        lg: "16px",
      },
    },
  },
  plugins: [],
} satisfies Config;
