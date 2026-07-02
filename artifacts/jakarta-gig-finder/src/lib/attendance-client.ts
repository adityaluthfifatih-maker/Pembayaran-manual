/**
 * Browser client for the QR attendance (Presensi) endpoints.
 *
 *   • the EMPLOYER device requests a short-lived token and renders it as a real
 *     QR code (masuk = check-in, pulang = check-out),
 *   • the WORKER device scans that QR with a live camera and redeems the token.
 *
 * The successful scan is persisted server-side and fanned out over the
 * WebSocket (see `subscribeAttendance` in central-server.ts) so both devices
 * react instantly.
 */

const API_BASE = "/api";

export type AttendanceKind = "masuk" | "pulang";

export interface AttendanceToken {
  token: string;
  expiresAt: number;
}

/** Employer: mint a single-use, short-lived QR token for a job + presence kind. */
export async function requestAttendanceToken(
  jobId: number,
  kind: AttendanceKind,
): Promise<AttendanceToken> {
  const res = await fetch(`${API_BASE}/attendance/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, kind }),
  });
  if (!res.ok) throw new Error("Gagal membuat QR Presensi.");
  return (await res.json()) as AttendanceToken;
}

export interface AttendanceRow {
  id: number;
  jobId: number;
  workerName: string;
  kind: AttendanceKind;
  at: string;
}

/** Worker: redeem a scanned QR token. Server validates, persists and broadcasts. */
export async function submitAttendanceScan(
  token: string,
  workerName: string,
): Promise<AttendanceRow> {
  const res = await fetch(`${API_BASE}/attendance/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, workerName }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "QR tidak valid atau sudah kadaluarsa.");
  }
  return (await res.json()) as AttendanceRow;
}
