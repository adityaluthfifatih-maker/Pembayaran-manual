import type { CustomJob } from "@/types/custom-job";

/**
 * Central Virtual Server
 * ----------------------
 * A single reactive source-of-truth that simulates a live multi-user backend
 * inside one browser window. The Employer subsystem pushes broadcast gigs here
 * via `broadcastToServer`, and the Worker subsystem subscribes to receive them
 * in real time (radar markers + toast notification).
 *
 * The store is also mirrored onto `window.centralServer` / `window.broadcastToServer`
 * so it is inspectable and scriptable exactly as specified.
 */

export type Gig = CustomJob;

// `gig` is the newly broadcast gig, or `null` for a bulk state change (e.g. reset).
export type ServerSubscriber = (gig: Gig | null, activeGigs: Gig[]) => void;

export interface CentralServer {
  activeGigs: Gig[];
  subscribers: ServerSubscriber[];
}

const server: CentralServer = {
  activeGigs: [],
  subscribers: [],
};

/** Jakarta city centre used as the geofence origin. */
export const JAKARTA_GEO_CENTER = { lat: -6.2088, lng: 106.8456 };

/**
 * Uniformly-random coordinates within a strict `radiusKm` geofence around a
 * centre point (defaults to the 5 km Jakarta geofence).
 */
export function randomGeofenceCoords(
  radiusKm = 5,
  center = JAKARTA_GEO_CENTER,
): { lat: number; lng: number } {
  const radiusDeg = radiusKm / 111; // ~111 km per degree of latitude
  const angle = 2 * Math.PI * Math.random();
  const dist = radiusDeg * Math.sqrt(Math.random()); // sqrt => uniform over area
  const lat = center.lat + dist * Math.cos(angle);
  const lng =
    center.lng + (dist * Math.sin(angle)) / Math.cos((center.lat * Math.PI) / 180);
  return { lat, lng };
}

function notify(gig: Gig | null): void {
  for (const cb of [...server.subscribers]) {
    try {
      cb(gig, server.activeGigs);
    } catch {
      /* a broken subscriber must not break the broadcast */
    }
  }
}

/**
 * Push a gig into the central server and notify every subscriber.
 * Upserts by `id` so re-broadcasting the same job (e.g. lock after posting)
 * replaces the existing entry instead of creating duplicate markers.
 */
export function broadcastToServer(gig: Gig): Gig {
  server.activeGigs = [gig, ...server.activeGigs.filter((g) => g.id !== gig.id)];
  notify(gig);
  return gig;
}

/** Subscribe to real-time broadcasts. Returns an unsubscribe function. */
export function subscribeToServer(cb: ServerSubscriber): () => void {
  server.subscribers.push(cb);
  return () => {
    server.subscribers = server.subscribers.filter((s) => s !== cb);
  };
}

/** Current snapshot of all active gigs on the server. */
export function getActiveGigs(): Gig[] {
  return server.activeGigs;
}

/** Clear the server (used on logout so sessions don't leak gigs). */
export function resetServer(): void {
  server.activeGigs = [];
  notify(null); // push empty state to all live subscribers
}

// Mirror the store onto `window` so it is the literal, inspectable source of truth.
if (typeof window !== "undefined") {
  (window as unknown as { centralServer: CentralServer }).centralServer = server;
  (window as unknown as { broadcastToServer: typeof broadcastToServer }).broadcastToServer =
    broadcastToServer;
}
