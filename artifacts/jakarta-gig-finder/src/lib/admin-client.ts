/**
 * Browser client for the Tilu Company admin control plane. All calls rely on a
 * separate httpOnly admin session cookie set by the server, so
 * `credentials: "include"` is required on every request.
 */
const API_BASE = "/api";

export class AdminError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AdminError(
      (data as { error?: string }).error ?? "Terjadi kesalahan.",
      res.status,
    );
  }
  return data as T;
}

export type LedgerStatus = "deposited" | "working" | "released";

export interface LedgerRow {
  jobId: number;
  posisi: string;
  employerName: string;
  workerName: string;
  totalUpah: number;
  komisiPlatform: number;
  totalSetoran: number;
  escrowStatus: string;
  status: LedgerStatus;
  postedAt: string;
}

export interface AdminUserRow {
  id: string;
  name: string;
  displayName: string;
  email: string;
  role: string;
  suspended: boolean;
  negativeRatings: number;
  createdAt: string;
}

export interface AcademyData {
  completedQuizzes: unknown[];
  questions: unknown[];
}

export function adminLogin(adminId: string, token: string): Promise<{ ok: true }> {
  return request("/admin/login", "POST", { adminId, token });
}

export function adminLogout(): Promise<void> {
  return request("/admin/logout", "POST");
}

export function adminMe(): Promise<{ ok: true }> {
  return request("/admin/me", "GET");
}

export function fetchLedger(): Promise<LedgerRow[]> {
  return request("/admin/ledger", "GET");
}

export function forceRelease(jobId: number): Promise<{ ok: true }> {
  return request("/admin/force-release", "POST", { jobId });
}

export function fetchAdminUsers(): Promise<AdminUserRow[]> {
  return request("/admin/users", "GET");
}

export function toggleSuspend(
  userId: string,
  suspended: boolean,
): Promise<{ id: string; suspended: boolean }> {
  return request("/admin/users/suspend", "POST", { userId, suspended });
}

export function fetchAcademy(): Promise<AcademyData> {
  return request("/admin/academy", "GET");
}

// ── Pusat Resolusi: remote proof-of-work disputes ────────────────────

export interface DisputeRow {
  jobId: number;
  posisi: string;
  employerId: string | null;
  employerName: string;
  proofUrl: string | null;
  escrowAmount: number;
  workerNet: number;
  postedAt: string;
}

export function fetchDisputes(): Promise<DisputeRow[]> {
  return request("/admin/disputes", "GET");
}

/** Rule a dispute in the EMPLOYER's favour → refund the locked escrow. */
export function refund(jobId: number): Promise<{ ok: true }> {
  return request("/admin/refund", "POST", { jobId });
}

// ── Monitoring Proyek Fisik: on-site tracker + daily payout log ──────

export interface OnsiteGigRow {
  jobId: number;
  posisi: string;
  employerName: string;
  jumlahHari: number;
  daysPaid: number;
  escrowAmount: number;
  escrowStatus: string;
  alamat: string | null;
}

export interface DailyPayoutRow {
  id: number;
  jobId: number;
  workerName: string;
  dayIndex: number;
  grossFraction: number;
  platformFee: number;
  netToWorker: number;
  at: string;
}

export interface OnsiteData {
  gigs: OnsiteGigRow[];
  payouts: DailyPayoutRow[];
}

export function fetchOnsite(): Promise<OnsiteData> {
  return request("/admin/onsite", "GET");
}

// ── Silent SOS emergency incidents ───────────────────────────────────

export interface EmergencyIncident {
  id: number;
  jobId: number | null;
  workerName: string;
  workerPhone: string;
  jobTitle: string;
  employerName: string;
  projectAddress: string;
  boronganType: "remote" | "onsite" | null;
  state: string;
  createdAt: string;
}

export function fetchEmergencies(): Promise<EmergencyIncident[]> {
  return request("/emergency", "GET");
}

export function resolveEmergency(id: number): Promise<{ ok: true }> {
  return request("/emergency/resolve", "POST", { id });
}
