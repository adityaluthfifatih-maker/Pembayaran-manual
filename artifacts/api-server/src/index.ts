import app from "./app";
import { logger } from "./lib/logger";
import { attachRealtime } from "./lib/realtime";
import { ensureEarthdistanceExtensions } from "./lib/geo";

if (process.env["NODE_ENV"] === "production") {
  const hasAdminId = !!process.env["ADMIN_ID"]?.trim();
  const hasAdminToken = !!process.env["ADMIN_TOKEN"]?.trim();
  if (!hasAdminId || !hasAdminToken) {
    throw new Error(
      "Production startup blocked: ADMIN_ID and ADMIN_TOKEN must be configured as secrets. " +
        "The demo admin credentials (tilu_admin / rekhastha2026) are disabled in production. " +
        "Set both secrets before deploying.",
    );
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

attachRealtime(server);

void ensureEarthdistanceExtensions();
