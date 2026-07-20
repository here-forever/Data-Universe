import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#152033",
        muted: "#64748b",
        canvas: "#f7f8fc",
        panel: "#ffffff",
        line: "#d9e2ef",
        brand: "#2563eb",
        sky: "#3b9ee8",
        lilac: "#7657d8",
        rose: "#d95f8d",
        mint: "#2d9d78",
        cyan: "#0891b2",
        emerald: "#059669",
        amber: "#d97706",
      },
      boxShadow: {
        panel: "0 18px 45px rgba(15, 23, 42, 0.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;
