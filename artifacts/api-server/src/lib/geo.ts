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

const EARTH_RADIUS_M = 6_371_000;

/**
 * Fuzz a worker's real coordinates by 300-500m in a random direction so a
 * company can never pinpoint an exact home/street location from the radar —
 * only an approximate "nearby" pin. Distance shown to the company is still
 * computed from the REAL coordinates before fuzzing.
 */
export function fuzzCoordinate(lat: number, lng: number): { lat: number; lng: number } {
  const distanceM = 300 + Math.random() * 200; // 300–500m
  const bearing = Math.random() * 2 * Math.PI;

  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const angularDistance = distanceM / EARTH_RADIUS_M;

  const newLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(angularDistance) +
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const newLngRad =
    lngRad +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(newLatRad),
    );

  return {
    lat: (newLatRad * 180) / Math.PI,
    lng: (newLngRad * 180) / Math.PI,
  };
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
