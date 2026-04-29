import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Default to loopback IP so the dev proxy always resolves (some Node/DNS setups fail on "localhost").
const api = process.env.VITE_API_URL ?? "http://127.0.0.1:3001";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": {
        target: api,
        changeOrigin: true,
      },
    },
  },
});
