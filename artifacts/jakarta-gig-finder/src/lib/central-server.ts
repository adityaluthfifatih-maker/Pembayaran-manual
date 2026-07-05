import type { CustomJob } from "@/types/custom-job";

/**
 * Live gig client
 * ---------------
 * The real source-of-truth now lives in the Postgres-backed API server. This
 * module is the browser-side client for it:
 *
 *   • hydrates the current gig list via `GET /api/gigs`,
 *   • opens a WebSocket to `/api/ws` and receives every new gig the instant an
 *     employer posts it (fan-out from the server),
 *   • exposes the SAME synchronous API the app already used
 *     (`subscribeToServer`, `broadcastToServer`, `getActiveGigs`, …) so the UI
 *     did not need a rewrite.
 *
 * IMPORTANT: the audible chime + native OS notification are NOT fired here. They
 * fire on the *receiving* worker device inside the subscriber (role-gated), so
 * the employer device that posts stays silent while every worker device alerts.
 */

export type Gig = CustomJob;

// `gig` is the newly broadcast gig, or `null` for a bulk state change (hydrate/reset).
export type ServerSubscriber = (gig: Gig | null, activeGigs: Gig[]) => void;

/** A live QR attendance (Presensi) event fanned out over the WebSocket. */
export interface AttendanceEvent {
  id: number;
  jobId: number;
  workerName: string;
  kind: "masuk" | "pulang";
  at: string;
}
export type AttendanceSubscriber = (event: AttendanceEvent) => void;

/**
 * A job application row as returned by the server (masked identity fields).
 * Emitted on `application_new` (full row) and `application_status` (partial:
 * only `id`, `status`, `jobId` are guaranteed).
 */
export interface ApplicationEvent {
  id: number;
  jobId: number;
  jobTitle: string;
  workerId: string;
  workerName: string;
  workerNikMasked: string;
  workerNpwpMasked: string;
  hasNpwp: boolean;
  bank: string;
  rekening: string;
  /** Optional CV / portfolio links — present when the worker provided them. */
  cvLink?: string | null;
  portfolioLink?: string | null;
  /** CV/Portfolio actually attached to this application (Regular jobs only). */
  submittedCvUrl?: string | null;
  submittedPortfolioUrl?: string | null;
  status: string;
  createdAt: string;
  /** "cepat" (Instant) | "lama" (Regular) — drives the notification copy. */
  hiringMode?: "cepat" | "lama";
}
export type ApplicationSubscriber = (event: ApplicationEvent) => void;

/** A chat message row as returned by the server (POST /api/chat/:jobId/:workerId). */
export interface ChatMessageEvent {
  id: number;
  jobId: number;
  /** The worker side of the conversation thread. */
  workerId: string;
  senderId: string;
  /** "pekerja" | "perusahaan" — map to "worker" | "company" on the client. */
  senderRole: string;
  text: string;
  sentAt: string;
  /** Optional attachment — server-relative path served via /api/uploads/chat/:filename */
  attachmentUrl?: string | null;
  attachmentType?: string | null;
  fileSize?: number | null;
}
export type ChatMessageSubscriber = (event: ChatMessageEvent) => void;

const API_BASE = "/api";

let activeGigs: Gig[] = [];
let subscribers: ServerSubscriber[] = [];
let attendanceSubscribers: AttendanceSubscriber[] = [];
let applicationSubscribers: ApplicationSubscriber[] = [];
let chatMessageSubscribers: ChatMessageSubscriber[] = [];

function notify(gig: Gig | null): void {
  for (const cb of [...subscribers]) {
    try {
      cb(gig, activeGigs);
    } catch {
      /* a broken subscriber must not break the broadcast */
    }
  }
}

/**
 * Normalise a raw server row into the app's `CustomJob` shape (revive Dates).
 *
 * The spread of `raw` intentionally carries ALL server fields through verbatim,
 * including `feeRate` and `jobCategory`.  This is what guarantees that both the
 * hydration path (GET /api/gigs → notify(null)) and the WS-echo path
 * (gig_broadcast → notify(gig)) deliver the same stored fee rate to the sync
 * effect in home.tsx — no intermediate DEFAULT_FEE_RATE flash is possible.
 */
function reviveGig(raw: Record<string, unknown>): Gig {
  // Coerce feeRate to a finite number.  If the server sends it as a string
  // (e.g. "0.03") or as NaN we convert safely; if it is absent we leave it
  // undefined so callers fall back to the category default rather than NaN.
  let feeRate: number | undefined;
  if (raw.feeRate !== undefined && raw.feeRate !== null) {
    const coerced = Number(raw.feeRate);
    if (Number.isFinite(coerced)) {
      feeRate = coerced;
    } else {
      console.warn(
        "[reviveGig] Non-numeric feeRate received from server — ignoring.",
        { raw: raw.feeRate, gigId: raw.id },
      );
    }
  }

  return {
    ...(raw as unknown as Gig),
    type: "custom_job",
    postedAt: raw.postedAt ? new Date(raw.postedAt as string) : new Date(),
    jobDate: raw.jobDate ? new Date(raw.jobDate as string) : undefined,
    feeRate,
  };
}

/** Serialise a gig for the wire (Dates → ISO strings, drop the type tag). */
function serializeGig(gig: Gig): Record<string, unknown> {
  const { type: _type, ...rest } = gig;
  void _type;
  return {
    ...rest,
    postedAt:
      gig.postedAt instanceof Date ? gig.postedAt.toISOString() : gig.postedAt,
    jobDate:
      gig.jobDate instanceof Date ? gig.jobDate.toISOString() : gig.jobDate ?? null,
  };
}

function upsertLocal(gig: Gig): void {
  activeGigs = [gig, ...activeGigs.filter((g) => g.id !== gig.id)];
}

// ── Hydration + live WebSocket ────────────────────────────────────────

let started = false;

async function hydrate(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/gigs`);
    if (!res.ok) return;
    const rows = (await res.json()) as Record<string, unknown>[];
    activeGigs = rows.map(reviveGig);
    notify(null); // bulk refresh — no per-gig alert
  } catch {
    /* offline / server not ready — the WebSocket will catch up later */
  }
}

/**
 * Re-fetch all applications from the server and fan each row out through
 * `applicationSubscribers`. Called on WS reconnect so any `application_new`
 * events that were missed during the offline window are recovered.
 *
 * Deduplication is the subscriber's responsibility: the employer handler in
 * home.tsx checks `processedApplicationRef` before adding a row to state, so
 * already-visible applications are silently dropped and only new ones appear.
 */
async function hydrateApplications(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/applications`);
    if (!res.ok) return;
    const rows = (await res.json()) as ApplicationEvent[];
    if (!rows.length) return;
    for (const row of rows) {
      for (const cb of [...applicationSubscribers]) {
        try {
          cb(row);
        } catch {
          /* a broken subscriber must not break the fan-out */
        }
      }
    }
  } catch {
    /* offline / server not ready — subscribers will catch up on the next reconnect */
  }
}

let ws: WebSocket | null = null;
let wsRetry = 0;
let wsHasOpened = false;

function scheduleReconnect(): void {
  const delay = Math.min(1000 * 2 ** wsRetry, 15000);
  wsRetry += 1;
  setTimeout(connectWs, delay);
}

function connectWs(): void {
  if (typeof window === "undefined") return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }
  try {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${proto}//${window.location.host}${API_BASE}/ws`);

    ws.onopen = () => {
      wsRetry = 0;
      // On a RECONNECT, re-hydrate so any events broadcast while this client was
      // offline are recovered (initial hydrate already ran in ensureStarted).
      if (wsHasOpened) {
        void hydrate();
        // Also re-fetch applications: any `application_new` events missed during
        // the offline window are replayed through applicationSubscribers.
        // The employer handler in home.tsx deduplicates via processedApplicationRef,
        // so already-visible rows are silently dropped.
        void hydrateApplications();
      }
      wsHasOpened = true;
    };
    ws.onmessage = (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(ev.data as string) as {
          type: string;
          gig?: Record<string, unknown>;
          attendance?: Record<string, unknown>;
          application?: Record<string, unknown>;
          message?: Record<string, unknown>;
          id?: number;
          status?: string;
          jobId?: number;
        };
        if (msg.type === "gig_broadcast" && msg.gig) {
          const gig = reviveGig(msg.gig);
          upsertLocal(gig);
          notify(gig); // per-gig → receiving worker device alerts
        } else if (msg.type === "attendance" && msg.attendance) {
          const event = msg.attendance as unknown as AttendanceEvent;
          for (const cb of [...attendanceSubscribers]) {
            try {
              cb(event);
            } catch {
              /* a broken subscriber must not break the fan-out */
            }
          }
        } else if (msg.type === "application_new" && msg.application) {
          const event = msg.application as unknown as ApplicationEvent;
          for (const cb of [...applicationSubscribers]) {
            try {
              cb(event);
            } catch {
              /* a broken subscriber must not break the fan-out */
            }
          }
        } else if (
          msg.type === "application_status" &&
          msg.id != null
        ) {
          // Partial event: only id / status / jobId are guaranteed.
          const event = {
            id: msg.id,
            status: msg.status ?? "",
            jobId: msg.jobId ?? 0,
          } as ApplicationEvent;
          for (const cb of [...applicationSubscribers]) {
            try {
              cb(event);
            } catch {
              /* best effort */
            }
          }
        } else if (msg.type === "chat_message" && msg.message) {
          const event = msg.message as unknown as ChatMessageEvent;
          for (const cb of [...chatMessageSubscribers]) {
            try {
              cb(event);
            } catch {
              /* a broken subscriber must not break the fan-out */
            }
          }
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      ws = null;
      scheduleReconnect();
    };
    ws.onerror = () => {
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  } catch {
    scheduleReconnect();
  }
}

function ensureStarted(): void {
  if (started) return;
  started = true;
  void hydrate();
  connectWs();
}

/**
 * Force-close the current WebSocket and immediately reconnect.
 *
 * Call this after a successful login so the new connection carries the
 * freshly-set session cookie. Without this, the socket opened at app-mount
 * (before auth) is never registered in the server's `userClients` map, and
 * scoped deliveries (chat messages) are silently dropped.
 *
 * The existing auto-reconnect + hydrate path handles the re-open; all
 * subscribers remain registered and receive events from the new socket.
 */
export function reconnectWs(): void {
  if (typeof window === "undefined") return;
  wsRetry = 0; // reconnect immediately, no backoff
  try {
    ws?.close();
  } catch {
    /* ignore errors on already-closing sockets */
  }
}

// ── Public API (unchanged surface) ────────────────────────────────────

async function postGig(gig: Gig): Promise<void> {
  try {
    await fetch(`${API_BASE}/gigs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serializeGig(gig)),
    });
  } catch {
    /* the optimistic local copy already showed; retry happens on next post */
  }
}

/**
 * Persist a job application to the server. The server stores the row and
 * fans it out over the WebSocket hub so the employer's device receives it
 * instantly without polling.
 *
 * Returns the persisted row on success, or null if the request fails (the
 * optimistic local notification in the worker UI already showed, so failure
 * is silent from the worker's perspective).
 */
export async function postApplication(data: {
  jobId: number;
  jobTitle: string;
  workerName: string;
  workerNikMasked: string;
  workerNpwpMasked: string;
  hasNpwp: boolean;
  bank: string;
  rekening: string;
  /** Optional CV / portfolio links — only sent when the worker filled them in. */
  cvLink?: string;
  portfolioLink?: string;
  /** Regular-job dual-entry CV/Portfolio override for this application only. */
  submittedCvUrl?: string;
  submittedPortfolioUrl?: string;
}): Promise<ApplicationEvent | null> {
  try {
    const res = await fetch(`${API_BASE}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) return null;
    return (await res.json()) as ApplicationEvent;
  } catch {
    return null;
  }
}

/**
 * Publish a gig to the real server. Optimistically upserts locally (so the
 * poster's own radar updates instantly, silently) then POSTs — the server
 * fans it out over WebSocket to every other connected device.
 */
export function broadcastToServer(gig: Gig): Gig {
  upsertLocal(gig);
  notify(null); // silent local refresh — the poster never alerts itself
  void postGig(gig);
  return gig;
}

/**
 * Escrow-locked broadcast dispatcher. Publishes to the server ONLY — the chime
 * and native notification are raised on the receiving worker device inside the
 * subscriber, so the employer device that triggered it stays silent.
 */
export function triggerGlobalEscrowBroadcast(gig: Gig): Gig {
  return broadcastToServer(gig);
}

/** Subscribe to real-time broadcasts. Returns an unsubscribe function. */
export function subscribeToServer(cb: ServerSubscriber): () => void {
  subscribers.push(cb);
  ensureStarted();
  // Push the current snapshot immediately so late subscribers are in sync.
  try {
    cb(null, activeGigs);
  } catch {
    /* best effort */
  }
  return () => {
    subscribers = subscribers.filter((s) => s !== cb);
  };
}

/**
 * Subscribe to live QR attendance events (a worker scanned a masuk/pulang QR).
 * Ensures the WebSocket is started. Returns an unsubscribe function.
 */
export function subscribeAttendance(cb: AttendanceSubscriber): () => void {
  attendanceSubscribers.push(cb);
  ensureStarted();
  return () => {
    attendanceSubscribers = attendanceSubscribers.filter((s) => s !== cb);
  };
}

/**
 * Subscribe to job application events:
 *   • `application_new`    — full ApplicationEvent row (employer side: show in panel)
 *   • `application_status` — partial row with id/status/jobId (worker side: update badge)
 * Ensures the WebSocket is started. Returns an unsubscribe function.
 */
export function subscribeApplication(cb: ApplicationSubscriber): () => void {
  applicationSubscribers.push(cb);
  ensureStarted();
  return () => {
    applicationSubscribers = applicationSubscribers.filter((s) => s !== cb);
  };
}

/**
 * Subscribe to real-time chat message events for any job. The subscriber
 * should filter by `event.jobId` to ignore messages for other conversations.
 * Ensures the WebSocket is started. Returns an unsubscribe function.
 */
export function subscribeChatMessage(cb: ChatMessageSubscriber): () => void {
  chatMessageSubscribers.push(cb);
  ensureStarted();
  return () => {
    chatMessageSubscribers = chatMessageSubscribers.filter((s) => s !== cb);
  };
}

/** Current snapshot of all active gigs known to this client. */
export function getActiveGigs(): Gig[] {
  return activeGigs;
}

/**
 * Clear the LOCAL cache only (used on logout so a session's radar clears). This
 * never deletes server rows — other devices keep their gigs.
 */
export function resetServer(): void {
  activeGigs = [];
  notify(null);
}

// ── Alert engine: audible chime + native OS notification ──────────────

/**
 * A single shared AudioContext, kept alive for the whole session. Reusing one
 * context (rather than creating a fresh one per chime) is what defeats browser
 * autoplay policies: once it has been resumed inside a trusted user gesture, it
 * stays "running" and later chimes — even ones fired from a React effect on a
 * WebSocket message — play reliably (incl. mobile Safari).
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

/**
 * Loud, urgent "buzzer/ringtone" alert for a new Broadcast Instan. Unlike the
 * gentle two-tone chime, this is a rapid square-wave triple-beep designed to be
 * impossible to ignore. It is meant to be called on a loop (every ~2s) by the
 * persistent instant-gig alarm overlay until the worker dismisses it.
 */
export function playAlarmBuzzer(): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    // Three rapid rising beeps — a clear emergency-style buzzer.
    [0, 0.2, 0.4].forEach((t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      const start = now + t;
      osc.frequency.setValueAtTime(880, start);
      osc.frequency.setValueAtTime(1245, start + 0.09);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.32, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.17);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.19);
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

// Expose a minimal inspectable handle on `window` for debugging/scripting.
if (typeof window !== "undefined") {
  const w = window as unknown as {
    centralServer: { activeGigs: Gig[]; subscribers: ServerSubscriber[] };
    broadcastToServer: typeof broadcastToServer;
    triggerGlobalEscrowBroadcast: typeof triggerGlobalEscrowBroadcast;
  };
  w.centralServer = {
    get activeGigs() {
      return activeGigs;
    },
    get subscribers() {
      return subscribers;
    },
  };
  w.broadcastToServer = broadcastToServer;
  w.triggerGlobalEscrowBroadcast = triggerGlobalEscrowBroadcast;
}
