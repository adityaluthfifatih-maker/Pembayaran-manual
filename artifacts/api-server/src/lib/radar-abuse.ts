import { db, radarScrapeAlertsTable } from "@workspace/db";
import { logger } from "./logger";

/**
 * Lightweight in-memory abuse heuristic for `GET /api/companies/radar-stats`.
 *
 * The endpoint itself only ever returns an aggregate count (see routes/geo.ts
 * for why), but a company could still try to infer individual worker
 * locations by hammering the endpoint with many slightly different
 * lat/lng/radius combos and diffing the counts (a timing/triangulation
 * attack). This module doesn't block those requests — the response shape
 * gives an attacker almost nothing to work with regardless — but it flags
 * the pattern so admins have visibility into who's trying.
 */

const WINDOW_MS = 60_000;
const CALL_THRESHOLD = 8;
const DISTINCT_LOCATION_THRESHOLD = 4;
const ALERT_COOLDOWN_MS = WINDOW_MS;

interface RadarCall {
  at: number;
  lat: number;
  lng: number;
  radiusKm: number;
}

const recentCallsByCompany = new Map<string, RadarCall[]>();
const lastAlertAtByCompany = new Map<string, number>();

function locationKey(lat: number, lng: number, radiusKm: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)},${radiusKm}`;
}

export interface RadarAbuseCheck {
  flagged: boolean;
  requestCount: number;
  distinctLocations: number;
}

/** Record a radar-stats call and return whether this burst looks abusive. */
export function recordRadarCall(companyId: string, lat: number, lng: number, radiusKm: number): RadarAbuseCheck {
  const now = Date.now();
  const calls = (recentCallsByCompany.get(companyId) ?? []).filter((c) => now - c.at < WINDOW_MS);
  calls.push({ at: now, lat, lng, radiusKm });
  recentCallsByCompany.set(companyId, calls);

  const distinctLocations = new Set(calls.map((c) => locationKey(c.lat, c.lng, c.radiusKm))).size;
  const flagged = calls.length > CALL_THRESHOLD || distinctLocations > DISTINCT_LOCATION_THRESHOLD;

  return { flagged, requestCount: calls.length, distinctLocations };
}

/**
 * Persist + log a scrape alert, but only once per cooldown window per
 * company so a sustained burst doesn't write one row per request.
 */
export async function maybeRecordRadarAbuseAlert(
  companyId: string,
  ip: string | undefined,
  check: RadarAbuseCheck,
): Promise<void> {
  if (!check.flagged) return;

  const now = Date.now();
  const lastAlertAt = lastAlertAtByCompany.get(companyId) ?? 0;
  if (now - lastAlertAt < ALERT_COOLDOWN_MS) return;
  lastAlertAtByCompany.set(companyId, now);

  logger.warn(
    { companyId, ip, requestCount: check.requestCount, distinctLocations: check.distinctLocations },
    "Suspicious radar-stats usage pattern (possible worker-location probing)",
  );

  try {
    await db.insert(radarScrapeAlertsTable).values({
      companyId,
      ip: ip ?? null,
      requestCount: check.requestCount,
      distinctLocations: check.distinctLocations,
      windowSeconds: Math.round(WINDOW_MS / 1000),
    });
  } catch (err) {
    logger.error({ err }, "Failed to persist radar scrape alert");
  }
}
