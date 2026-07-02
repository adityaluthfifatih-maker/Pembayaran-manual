import type { Server, IncomingMessage } from "http";
import type { Duplex } from "stream";
import { WebSocketServer, WebSocket } from "ws";
import { logger } from "./logger";
import { getSessionUser, SESSION_COOKIE } from "./auth";

/**
 * Realtime hub for the live gig feed and scoped chat delivery.
 *
 * A single WebSocket server (noServer mode) is attached to the shared HTTP
 * server and only claims upgrade requests on `/api/ws` (the Replit proxy
 * forwards the full base path un-rewritten).
 *
 * Two client registries are maintained:
 *  - `allClients` — every open socket; used for global fan-outs (gigs, attendance, etc.)
 *  - `userClients` — userId → Set<WebSocket>; used for participant-scoped delivery
 *    (chat messages).  Populated asynchronously after the session cookie is resolved.
 */
const wss = new WebSocketServer({ noServer: true });
const allClients = new Set<WebSocket>();
const userClients = new Map<string, Set<WebSocket>>();

const WS_PATH = "/api/ws";

/** Parse a single named value from a raw Cookie header string. */
function cookieValue(cookieHeader: string, name: string): string | undefined {
  for (const pair of cookieHeader.split(";")) {
    const [k, ...v] = pair.trim().split("=");
    if (k?.trim() === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
  allClients.add(ws);
  logger.info({ clients: allClients.size }, "Realtime client connected");

  // Resolve the authenticated user so we can scope chat delivery.
  const sessionId = cookieValue(req.headers.cookie ?? "", SESSION_COOKIE);
  const user = await getSessionUser(sessionId);
  const userId = user?.id ?? null;

  if (userId) {
    if (!userClients.has(userId)) userClients.set(userId, new Set());
    userClients.get(userId)!.add(ws);
  }

  ws.on("close", () => {
    allClients.delete(ws);
    if (userId) {
      userClients.get(userId)?.delete(ws);
      if (userClients.get(userId)?.size === 0) userClients.delete(userId);
    }
    logger.info({ clients: allClients.size }, "Realtime client disconnected");
  });
  ws.on("error", () => {
    allClients.delete(ws);
    if (userId) userClients.get(userId)?.delete(ws);
  });

  try {
    ws.send(JSON.stringify({ type: "connected" }));
  } catch {
    /* best effort */
  }
});

export function attachRealtime(server: Server): void {
  server.on(
    "upgrade",
    (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = req.url ?? "";
      if (url === WS_PATH || url.startsWith(`${WS_PATH}?`)) {
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit("connection", ws, req);
        });
      } else {
        socket.destroy();
      }
    },
  );
  logger.info({ path: WS_PATH }, "Realtime WebSocket attached");
}

/** Broadcast to every connected socket (gigs, attendance, applications, etc.). */
function broadcast(payload: unknown): void {
  const data = JSON.stringify(payload);
  for (const ws of allClients) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(data);
      } catch {
        /* a broken client must not break the fan-out */
      }
    }
  }
}

/** Send to all sockets registered under a specific user id. */
function sendToUser(userId: string, data: string): void {
  for (const ws of userClients.get(userId) ?? []) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(data);
      } catch {
        /* broken socket */
      }
    }
  }
}

/** Push a newly created/updated gig to every connected device. */
export function broadcastGig(gig: unknown): void {
  broadcast({ type: "gig_broadcast", gig });
}

/**
 * Push a QR attendance event (a worker scanned an employer's masuk/pulang QR)
 * to every connected device. The employer device that posted the job releases
 * escrow on a "pulang"; the worker device flips its shift state.
 */
export function broadcastAttendance(attendance: unknown): void {
  broadcast({ type: "attendance", attendance });
}

/**
 * Push a worker SOS incident to every connected device. The Admin Command
 * Center reacts by raising its full-screen emergency alarm; worker/employer
 * devices ignore it. Uses the `emergency_active` discriminator the admin listens
 * for.
 */
export function broadcastEmergency(incident: unknown): void {
  broadcast({ type: "emergency_active", incident });
}

/** Tell every device an SOS incident was resolved so the alarm can clear. */
export function broadcastEmergencyResolved(id: number): void {
  broadcast({ type: "emergency_resolved", id });
}

/** Push an on-site daily fractional payout to the admin tracker in realtime. */
export function broadcastDailyPayout(payout: unknown): void {
  broadcast({ type: "daily_payout", payout });
}

/**
 * Push a new worker application to every connected device. The employer device
 * that owns the job reacts by adding the applicant to its notification panel;
 * other devices ignore it.
 */
export function broadcastApplication(application: unknown): void {
  broadcast({ type: "application_new", application });
}

/**
 * Push an application status change (employer reviewed/accepted/rejected) so
 * the worker device can update its own notification panel in real time.
 */
export function broadcastApplicationStatus(
  id: number,
  status: string,
  jobId: number,
): void {
  broadcast({ type: "application_status", id, status, jobId });
}

/**
 * Push a new chat message only to the two conversation participants:
 * the employer (identified by `employerId`) and the specific worker
 * (`workerId`).  No other connected client receives the frame.
 */
export function broadcastChatMessage(
  message: unknown,
  employerId: string,
  workerId: string,
): void {
  const data = JSON.stringify({ type: "chat_message", message });
  sendToUser(employerId, data);
  if (workerId !== employerId) sendToUser(workerId, data);
}
