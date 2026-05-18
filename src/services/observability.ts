import * as Sentry from "@sentry/node";
import { config } from "../config.js";

export function initObservability(): void {
  if (!config.SENTRY_DSN) {
    console.log("Sentry: disabled (SENTRY_DSN not set)");
    return;
  }

  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,
    tracesSampleRate: config.isProduction ? 0.1 : 1.0,
  });
  console.log(`Sentry: enabled (${config.NODE_ENV})`);
}

export function captureError(err: unknown): void {
  if (config.SENTRY_DSN) {
    Sentry.captureException(err);
  }
}
