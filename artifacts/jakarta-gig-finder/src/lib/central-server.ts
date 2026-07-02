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

// ── Alert engine: audible chime + native OS notification ──────────────

/**
 * A single shared AudioContext, kept alive for the whole session. Reusing one
 * context (rather than creating a fresh one per chime) is what defeats browser
 * autoplay policies: once it has been resumed inside a trusted user gesture, it
 * stays "running" and later chimes — even ones fired from a React effect on role
 * switch — play reliably (incl. mobile Safari).
 */
let sharedAudioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx) sharedAudioCtx = new AudioCtx();
    if (sharedAudioCtx.state === "suspended") sharedAudioCtx.resume().catch(() => {});
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Prime/resume the shared AudioContext. Call this from a trusted user gesture
 * (first click/keypress/touch) so subsequent chimes are never blocked by the
 * browser's autoplay policy.
 */
export function unlockAudio(): void {
  getAudioCtx();
}

/**
 * Professional two-tone "ding-dong" alert chime via the Web Audio API — no
 * asset file required. Plays through the shared (pre-unlocked) context so it
 * lands reliably whether fired on broadcast or on role switch.
 */
export function playAlertChime(): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    // "Ding" (higher) then "dong" (lower) — a clear, professional alert.
    [{ f: 1318, t: 0 }, { f: 880, t: 0.16 }].forEach(({ f, t }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      const start = now + t;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.34);
    });
  } catch {
    /* audio is best-effort */
  }
}

const NATIVE_NOTIF_TITLE = "Rekhastha by Tilu Company";
const NATIVE_NOTIF_BODY =
  "Rekhastha: Lowongan Kerja Baru Terjamin Escrow Tersedia Dekat Anda!";

/** Ask for OS notification permission once, on app init. Best-effort. */
export function requestNotifPermission(): void {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  } catch {
    /* best effort */
  }
}

/** Raise a native OS-level notification (only if the user granted permission). */
export function fireNativeNotification(body: string = NATIVE_NOTIF_BODY): void {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    new Notification(NATIVE_NOTIF_TITLE, { body, tag: "rekhastha-gig" });
  } catch {
    /* best effort */
  }
}

/**
 * Global escrow-broadcast dispatcher. Fires the FULL alert pipeline the instant
 * an employer locks escrow, regardless of the current viewport role:
 *   1. pushes the gig to the reactive server → radar pins + role-gated toast
 *      (handled by subscribers),
 *   2. plays the audible device chime,
 *   3. raises a native OS-level notification.
 */
export function triggerGlobalEscrowBroadcast(gig: Gig): Gig {
  broadcastToServer(gig);
  playAlertChime();
  fireNativeNotification();
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

// Mirror the store + dispatchers onto `window` so they are the literal,
// inspectable, scriptable source of truth.
if (typeof window !== "undefined") {
  const w = window as unknown as {
    centralServer: CentralServer;
    broadcastToServer: typeof broadcastToServer;
    triggerGlobalEscrowBroadcast: typeof triggerGlobalEscrowBroadcast;
  };
  w.centralServer = server;
  w.broadcastToServer = broadcastToServer;
  w.triggerGlobalEscrowBroadcast = triggerGlobalEscrowBroadcast;
}
