import { buildApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { ttsWorker } from "./tts-worker.js";

const app = await buildApp();

async function shutdown(signal: string) {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  ttsWorker.stop();
  await pool.end();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: "0.0.0.0", port: config.port });
  ttsWorker.start();
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
