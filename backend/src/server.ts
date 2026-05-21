import http from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { ensureSystemBootstrap } from "./services/system-bootstrap.service.js";
import { initializeRealtime } from "./services/realtime.service.js";

let server: http.Server | undefined;

async function startServer() {
  await ensureSystemBootstrap();

  const app = createApp();
  server = http.createServer(app);
  initializeRealtime(server);

  server.requestTimeout = 30_000;
  server.headersTimeout = 35_000;
  server.keepAliveTimeout = 5_000;

  server.on("error", (error) => {
    console.error("Server failed to start:", error);
    process.exit(1);
  });

  server.listen(env.PORT, env.HOST, () => {
    console.log(`Vianko Day backend listening on http://${env.HOST}:${env.PORT}`);
  });
}

async function shutdown(signal: string) {
  console.log(`${signal} received. Shutting down gracefully.`);

  if (!server) {
    await prisma.$disconnect();
    process.exit(0);
  }

  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });

  setTimeout(() => {
    process.exit(1);
  }, 10_000).unref();
}

void startServer().catch(async (error) => {
  console.error("Server bootstrap failed:", error);
  await prisma.$disconnect();
  process.exit(1);
});

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
