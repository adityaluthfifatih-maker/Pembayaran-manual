import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db, usersTable } from "@workspace/db";
import { getSessionUser, SESSION_COOKIE } from "../lib/auth";
import { fuzzCoordinate, haversineKm } from "../lib/geo";
import { getActiveSubscription } from "./monetization";

const router: IRouter = Router();

const RADAR_RADIUS_METERS = 5_000;

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const workerLocationSchema = locationSchema.extend({
  isReadyToWork: z.boolean().optional(),
});

/**
 * Worker devices call this whenever the "Radar Mencari Kerja" toggle is on
 * (and periodically while active) so companies can find nearby ready-to-work
 * applicants via GET /api/companies/radar.
 */
router.post("/workers/location", async (req, res) => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "pekerja") {
    res.status(403).json({ error: "Hanya pekerja yang dapat mengirim lokasi radar." });
    return;
  }

  const parsed = workerLocationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Koordinat tidak valid." });
    return;
  }

  const { lat, lng, isReadyToWork } = parsed.data;
  await db
    .update(usersTable)
    .set({
      latitude: lat,
      longitude: lng,
      locationUpdatedAt: new Date(),
      ...(isReadyToWork !== undefined ? { isReadyToWork } : {}),
    })
    .where(sql`${usersTable.id} = ${user.id}`);

  res.json({ ok: true });
});

/**
 * Employers set/refresh their business's home coordinate so the radar can
 * search around it. Reuses the same lat/lng columns as workers.
 */
router.post("/companies/location", async (req, res) => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "perusahaan") {
    res.status(403).json({ error: "Hanya perusahaan yang dapat mengatur lokasi ini." });
    return;
  }

  const parsed = locationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Koordinat tidak valid." });
    return;
  }

  await db
    .update(usersTable)
    .set({
      latitude: parsed.data.lat,
      longitude: parsed.data.lng,
      locationUpdatedAt: new Date(),
    })
    .where(sql`${usersTable.id} = ${user.id}`);

  res.json({ ok: true });
});

interface RadarRow extends Record<string, unknown> {
  id: string;
  name: string;
  skills: string[];
  whatsapp: string | null;
  latitude: number;
  longitude: number;
  distance_m: number;
}

/**
 * Nearby ready-to-work applicants within RADAR_RADIUS_METERS of the
 * company's saved (or query-override) location. Coordinates are fuzzed by
 * 300-500m before leaving the server so a company can never learn a
 * worker's exact position — only that they are "nearby".
 */
router.get("/companies/radar", async (req, res) => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "perusahaan") {
    res.status(403).json({ error: "Hanya perusahaan yang dapat mengakses radar pekerja." });
    return;
  }

  const queryLat = req.query["lat"] !== undefined ? Number(req.query["lat"]) : undefined;
  const queryLng = req.query["lng"] !== undefined ? Number(req.query["lng"]) : undefined;

  const originLat = Number.isFinite(queryLat) ? (queryLat as number) : user.latitude;
  const originLng = Number.isFinite(queryLng) ? (queryLng as number) : user.longitude;

  if (originLat === null || originLng === null || originLat === undefined || originLng === undefined) {
    res.status(400).json({
      error: "Lokasi perusahaan belum diatur. Aktifkan lokasi untuk melihat radar pekerja.",
    });
    return;
  }

  const rows = await db.execute<RadarRow>(sql`
    SELECT
      id, name, skills, whatsapp, latitude, longitude,
      earth_distance(ll_to_earth(${originLat}, ${originLng}), ll_to_earth(latitude, longitude)) AS distance_m
    FROM users
    WHERE role = 'pekerja'
      AND is_ready_to_work = true
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND earth_box(ll_to_earth(${originLat}, ${originLng}), ${RADAR_RADIUS_METERS}) @> ll_to_earth(latitude, longitude)
      AND earth_distance(ll_to_earth(${originLat}, ${originLng}), ll_to_earth(latitude, longitude)) <= ${RADAR_RADIUS_METERS}
    ORDER BY distance_m ASC
    LIMIT 100
  `);

  const subscription = await getActiveSubscription(user.id);
  const isPremium = !!subscription;

  const workers = rows.rows.map((r) => {
    const fuzzed = fuzzCoordinate(r.latitude, r.longitude);
    const distanceKm = haversineKm(originLat, originLng, r.latitude, r.longitude);
    const firstName = r.name.trim().split(/\s+/)[0] ?? r.name;
    return {
      id: r.id,
      firstName,
      skills: r.skills ?? [],
      distanceKm: Math.round(distanceKm * 10) / 10,
      lat: fuzzed.lat,
      lng: fuzzed.lng,
      whatsapp: isPremium ? r.whatsapp : null,
      contactLocked: !isPremium,
    };
  });

  res.json({ workers, isPremium, radiusKm: RADAR_RADIUS_METERS / 1000 });
});

export default router;
