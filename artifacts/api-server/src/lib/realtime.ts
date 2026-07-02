import type { Server, IncomingMessage } from "http";
import type { Duplex } from "stream";
import { WebSocketServer, WebSocket } from "ws";
import { logger } from "./logger";

/**
 * Realtime hub for the live gig feed.
 *
 * A single WebSocket server (noServer mode) is attached to the shared HTTP
 * server and only claims upgrade requests on `/api/ws` (the Replit proxy
 * forwards the full base path un-rewritten). Every POST /api/gigs fan-outs the
 * new gig to all connected clients so Worker devices receive it instantly.
 */
const wss = new WebSocketServer({ noServer: true });
const clients = new Set<WebSocket>();

const WS_PATH = "/api/ws";

wss.on("connection", (ws: WebSocket) => {
  clients.add(ws);
  logger.info({ clients: clients.size }, "Realtime client connected");

  ws.on("close", () => {
    clients.delete(ws);
    logger.info({ clients: clients.size }, "Realtime client disconnected");
  });
  ws.on("error", () => clients.delete(ws));

  // Greet the client so it can confirm the channel is live.
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

function broadcast(payload: unknown): void {
  const data = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(data);
      } catch {
        /* a broken client must not break the fan-out */
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
