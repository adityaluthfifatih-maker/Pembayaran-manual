import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db, usersTable } from "@workspace/db";
import { getSessionUser, SESSION_COOKIE } from "../lib/auth";
import { getActiveSubscription } from "./monetization";
import { recordRadarCall, maybeRecordRadarAbuseAlert } from "../lib/radar-abuse";

const router: IRouter = Router();

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
 * applicants via GET /api/companies/radar-stats.
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

interface RadarCountRow extends Record<string, unknown> {
  count: number;
}

const ALLOWED_RADIUS_KM = [3, 5] as const;

/**
 * Aggregate-only "Radar Pekerja Terdekat" stat for the company dashboard:
 * just a headcount of ready-to-work applicants within a 3-5km radius of the
 * company's saved (or query-override) location.
 *
 * Deliberately returns NO worker identity, contact info, or coordinates
 * (fuzzed or otherwise) — the previous /companies/radar endpoint exposed
 * individual worker pins + unlocked WhatsApp numbers to premium companies,
 * which let them contact workers directly and bypass the platform's escrow
 * fees, and leaked approximate home locations. A plain count carries none
 * of that risk while still answering "is there demand near me".
 */
router.get("/companies/radar-stats", async (req, res) => {
  const user = await getSessionUser(req.cookies?.[SESSION_COOKIE]);
  if (!user) {
    res.status(401).json({ error: "Tidak terautentikasi." });
    return;
  }
  if (user.role !== "perusahaan") {
    res.status(403).json({ error: "Hanya perusahaan yang dapat mengakses statistik radar pekerja." });
    return;
  }

  const queryLat = req.query["lat"] !== undefined ? Number(req.query["lat"]) : undefined;
  const queryLng = req.query["lng"] !== undefined ? Number(req.query["lng"]) : undefined;
  const queryRadius = req.query["radiusKm"] !== undefined ? Number(req.query["radiusKm"]) : undefined;

  const originLat = Number.isFinite(queryLat) ? (queryLat as number) : user.latitude;
  const originLng = Number.isFinite(queryLng) ? (queryLng as number) : user.longitude;
  const radiusKm = ALLOWED_RADIUS_KM.includes(queryRadius as 3 | 5) ? (queryRadius as 3 | 5) : 5;
  const radiusMeters = radiusKm * 1000;

  if (originLat === null || originLng === null || originLat === undefined || originLng === undefined) {
    res.status(400).json({
      error: "Lokasi perusahaan belum diatur. Aktifkan lokasi untuk melihat statistik radar pekerja.",
    });
    return;
  }

  const rows = await db.execute<RadarCountRow>(sql`
    SELECT COUNT(*)::int AS count
    FROM users
    WHERE role = 'pekerja'
      AND is_ready_to_work = true
      AND latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND earth_box(ll_to_earth(${originLat}, ${originLng}), ${radiusMeters}) @> ll_to_earth(latitude, longitude)
      AND earth_distance(ll_to_earth(${originLat}, ${originLng}), ll_to_earth(latitude, longitude)) <= ${radiusMeters}
  `);

  const count = rows.rows[0]?.count ?? 0;
  const subscription = await getActiveSubscription(user.id);

  const abuseCheck = recordRadarCall(user.id, originLat, originLng, radiusKm);
  void maybeRecordRadarAbuseAlert(user.id, req.ip, abuseCheck);

  res.json({ count, radiusKm, isPremium: !!subscription });
});

export default router;
