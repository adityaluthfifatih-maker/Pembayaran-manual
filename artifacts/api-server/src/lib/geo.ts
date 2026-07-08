import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";

/**
 * `cube` + `earthdistance` power the radius search in
 * GET /api/companies/radar-stats (earth_box / earth_distance over lat/lng).
 * Idempotent — safe to call on every boot.
 */
export async function ensureEarthdistanceExtensions(): Promise<void> {
  try {
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS cube`);
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS earthdistance`);
    logger.info("cube/earthdistance extensions ready");
  } catch (err) {
    logger.error({ err }, "Failed to enable cube/earthdistance extensions");
  }
}
