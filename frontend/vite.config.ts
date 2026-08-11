import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ command, mode }) => {
  const environment = loadEnv(mode, process.cwd(), "");
  if (command === "build" && !environment.VITE_API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is required for production builds");
  }
  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("/node_modules/echarts/")) return "echarts";
            if (id.includes("/node_modules/three/")) return "three";
          },
        },
      },
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
    },
    test: {
      coverage: {
        exclude: [
          "src/**/*.test.{ts,tsx}",
          "src/main.tsx",
          "src/test/**",
          "src/vite-env.d.ts",
        ],
        provider: "v8",
        reporter: ["text", "json-summary", "html"],
        thresholds: {
          branches: 60,
          functions: 60,
          lines: 60,
          statements: 60,
        },
      },
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/test/setup.ts",
    },
  };
});
