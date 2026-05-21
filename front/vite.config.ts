import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = env.API_PROXY_TARGET || "http://127.0.0.1:3012";

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: false,
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true
        },
        "/socket.io": {
          target: apiProxyTarget,
          changeOrigin: true,
          ws: true
        }
      }
    },
    preview: {
      port: 4173
    }
  };
});
