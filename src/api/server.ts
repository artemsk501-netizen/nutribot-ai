import express from "express";
import type { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Bot } from "grammy";
import { webhookCallback } from "grammy";
import { config } from "../config.js";
import { miniappApiRouter } from "./miniappRoutes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp(bot: Bot, useWebhook = false): express.Application {
  const app = express();

  app.use(express.json());

  if (useWebhook) {
    const webhookPath = config.WEBHOOK_SECRET
      ? `/webhook/${config.WEBHOOK_SECRET}`
      : "/webhook";
    app.use(webhookPath, webhookCallback(bot, "express"));
  }

  app.use(miniappApiRouter);

  const miniappDist = path.join(__dirname, "../../miniapp/dist");
  app.use("/miniapp", express.static(miniappDist));
  app.get("/miniapp", (_req, res) => {
    res.sendFile(path.join(miniappDist, "index.html"));
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

export async function startServer(app: express.Application): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(config.PORT, () => {
      console.log(`HTTP :${config.PORT}`);
      resolve(server);
    });
    server.once("error", reject);
  });
}
