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
  method: "GET" | "POST" | "PUT" | "DELETE",
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

/** Quiz-taking view: no correct answer or explanation. */
export interface AcademyQuestion {
  id: string;
  category: string;
  prompt: string;
  options: string[];
}

/** Admin editor view: includes correct answer and explanation. */
export interface AdminAcademyQuestion {
  id: number;
  slug: string;
  category: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  sortOrder: number;
}

export interface AcademyCompletion {
  id: number;
  adminId: string;
  correct: number;
  total: number;
  score: number;
  passed: boolean;
  completedAt: string;
}

export interface AcademyData {
  passingScore: number;
  questions: AcademyQuestion[];
  completions: AcademyCompletion[];
}

export interface AcademyAnswerResult {
  questionId: string;
  selectedIndex: number;
  correctIndex: number;
  correct: boolean;
  explanation: string;
}

export interface AcademyResult {
  id: number;
  completedAt: string;
  passingScore: number;
  correct: number;
  total: number;
  score: number;
  passed: boolean;
  answers: AcademyAnswerResult[];
}

export interface AcademySettings {
  passingScore: number;
}

export interface QuestionInput {
  category: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  sortOrder: number;
}

export function adminLogin(adminId: string, token: string): Promise<{ ok: true }> {
  return request("/admin/login", "POST", { adminId, token });
}

export function adminChangePassword(
  oldPassword: string,
  newPassword: string,
): Promise<{ ok: true }> {
  return request("/admin/change-password", "POST", { oldPassword, newPassword });
}

export function adminResetPassword(
  adminId: string,
  newPassword: string,
  recoveryToken: string,
): Promise<{ ok: true }> {
  return request("/admin/reset-password", "POST", { adminId, newPassword, recoveryToken });
}

export function adminLogout(): Promise<void> {
  return request("/admin/logout", "POST");
}

export function adminMe(): Promise<{ ok: true; trainingPassed: boolean; requireAcademy: boolean }> {
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

export function submitAcademy(
  answers: { questionId: string; selectedIndex: number }[],
): Promise<AcademyResult> {
  return request("/admin/academy/submit", "POST", { answers });
}

// ── Academy question editor ───────────────────────────────────────────────

export function fetchAcademyQuestions(): Promise<AdminAcademyQuestion[]> {
  return request("/admin/academy/questions", "GET");
}

export function createAcademyQuestion(data: QuestionInput): Promise<AdminAcademyQuestion> {
  return request("/admin/academy/questions", "POST", data);
}

export function updateAcademyQuestion(
  id: number,
  data: QuestionInput,
): Promise<AdminAcademyQuestion> {
  return request(`/admin/academy/questions/${id}`, "PUT", data);
}

export function deleteAcademyQuestion(id: number): Promise<{ ok: true }> {
  return request(`/admin/academy/questions/${id}`, "DELETE");
}

export function fetchAcademySettings(): Promise<AcademySettings> {
  return request("/admin/academy/settings", "GET");
}

export function updateAcademySettings(passingScore: number): Promise<AcademySettings> {
  return request("/admin/academy/settings", "PUT", { passingScore });
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

// ── Job Management: delete, refund, force-payout ─────────────────────

export interface JobManagementRow {
  jobId: number;
  posisi: string;
  employerName: string;
  escrowAmount: number;
  escrowStatus: string;
  hiringMode: string | null;
  postedAt: string;
}

export function fetchAdminJobs(): Promise<JobManagementRow[]> {
  return request("/admin/jobs", "GET");
}

export function deleteAdminJob(jobId: number, reason: string): Promise<{ ok: true }> {
  return request(`/admin/jobs/${jobId}`, "DELETE", { reason });
}

export function refundAdminJob(jobId: number, reason: string): Promise<{ ok: true }> {
  return request(`/admin/jobs/${jobId}/refund`, "POST", { reason });
}

export function forcePayoutAdminJob(jobId: number, reason: string): Promise<{ ok: true }> {
  return request(`/admin/jobs/${jobId}/force-payout`, "POST", { reason });
}

// ── Audit Logs ───────────────────────────────────────────────────────

export interface AdminLogRow {
  id: number;
  adminId: string;
  action: string;
  targetId: string | null;
  reason: string | null;
  createdAt: string;
}

export function fetchAdminLogs(): Promise<AdminLogRow[]> {
  return request("/admin/logs", "GET");
}

// ── KYC verification queue ────────────────────────────────────────

export type KycStatus = "unverified" | "pending" | "verified" | "rejected";

export interface KycRow {
  id: string;
  name: string;
  email: string;
  ktpPhotoUrl: string | null;
  selfieWithKtpUrl: string | null;
  verificationStatus: KycStatus;
}

export function fetchKycQueue(): Promise<KycRow[]> {
  return request("/admin/kyc", "GET");
}

export function verifyKyc(
  userId: string,
  status: "verified" | "rejected" | "pending",
): Promise<{ id: string; verificationStatus: KycStatus }> {
  return request("/admin/kyc/verify", "POST", { userId, status });
}

// ── Live platform stats ───────────────────────────────────────────

export interface AdminStats {
  totalUsers: number;
  newUsersToday: number;
  workers: number;
  employers: number;
  activeGigs: number;
  releasedGigs: number;
  disputedGigs: number;
  totalGigs: number;
  escrowHeld: number;
  escrowReleased: number;
  escrowDisputed: number;
}

export function fetchAdminStats(): Promise<AdminStats> {
  return request("/admin/stats", "GET");
}

// ── Revenue analytics ──────────────────────────────────────────────

export interface RevenueCategoryStat {
  count: number;
  amount: number;
}

export interface RevenueDailyPoint {
  date: string;
  instant: number;
  subscription: number;
  total: number;
}

export interface RevenueStats {
  totalRevenue: number;
  instantRevenue: number;
  subscriptionRevenue: number;
  todayRevenue: number;
  activeSubscriptions: number;
  totalInstantOrders: number;
  byCategory: Record<string, RevenueCategoryStat>;
  daily: RevenueDailyPoint[];
}

export function fetchRevenueStats(): Promise<RevenueStats> {
  return request("/admin/revenue", "GET");
}

// ── Manual payment and payout operations ───────────────────────────

export interface ManualFinanceSettings {
  id: number;
  bankName: string;
  accountName: string;
  accountNumber: string;
  instructions: string;
  updatedAt: string;
}

export interface ManualPaymentRow {
  id: number;
  payerId: string;
  payerName: string;
  payerEmail: string | null;
  targetType: string;
  targetId: string;
  amount: number;
  status: string;
  transferReference: string | null;
  proofNote: string | null;
  adminNote: string | null;
  createdAt: string;
}

export interface ManualPayoutRow {
  id: number;
  workerId: string;
  workerName: string;
  workerEmail: string | null;
  amount: number;
  bankName: string;
  accountName: string;
  accountNumber: string;
  status: string;
  transferReference: string | null;
  adminNote: string | null;
  createdAt: string;
}

export function fetchManualFinanceSettings(): Promise<{ settings: ManualFinanceSettings | null }> {
  return request("/admin/manual-finance/settings", "GET");
}

export function saveManualFinanceSettings(
  settings: Omit<ManualFinanceSettings, "id" | "updatedAt">,
): Promise<{ settings: ManualFinanceSettings }> {
  return request("/admin/manual-finance/settings", "PUT", settings);
}

export function fetchManualPayments(): Promise<{ payments: ManualPaymentRow[] }> {
  return request("/admin/manual-finance/payments", "GET");
}

export function reviewManualPayment(
  id: number,
  action: "confirm" | "reject",
  note: string,
): Promise<ManualPaymentRow> {
  return request(`/admin/manual-finance/payments/${id}/review`, "POST", { action, note });
}

export function fetchManualPayouts(): Promise<{ payouts: ManualPayoutRow[] }> {
  return request("/admin/manual-finance/payouts", "GET");
}

export function resolveManualPayout(
  id: number,
  action: "paid" | "reject",
  details: { transferReference?: string; note?: string },
): Promise<ManualPayoutRow> {
  return request(`/admin/manual-finance/payouts/${id}/resolve`, "POST", { action, ...details });
}
