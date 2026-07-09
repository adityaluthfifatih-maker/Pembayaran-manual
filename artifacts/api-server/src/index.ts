import app from "./app";
import { logger } from "./lib/logger";
import { attachRealtime } from "./lib/realtime";
import { ensureEarthdistanceExtensions } from "./lib/geo";
import { bootstrapAdminUser } from "./lib/admin";

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
void bootstrapAdminUser().catch((err: unknown) => {
  logger.error({ err }, "Failed to bootstrap admin user — server will continue but admin login may not work until resolved.");
});
