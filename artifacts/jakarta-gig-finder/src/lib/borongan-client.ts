import type { CustomJob } from "@/types/custom-job";

/**
 * Borongan (project contract) client.
 *
 *  • Remote: worker submits a proof-of-work URL; employer approves (instant
 *    escrow → worker) or rejects (freezes into `disputed_active` for the admin).
 *  • On-site: a verified daily QR check-out releases one day's wage fraction.
 */
const API_BASE = "/api";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error((msg as { error?: string }).error ?? "Terjadi kesalahan.");
  }
  return (await res.json()) as T;
}

export function submitRemoteProof(jobId: number, proofUrl: string): Promise<CustomJob> {
  return post<CustomJob>("/borongan/remote/submit-proof", { jobId, proofUrl });
}

export function approveRemoteProof(jobId: number): Promise<CustomJob> {
  return post<CustomJob>("/borongan/remote/approve", { jobId });
}

export function rejectRemoteProof(jobId: number): Promise<CustomJob> {
  return post<CustomJob>("/borongan/remote/reject", { jobId });
}

export interface DailyPayout {
  id: number;
  jobId: number;
  workerName: string;
  dayIndex: number;
  grossFraction: number;
  platformFee: number;
  netToWorker: number;
  at: string;
}

export function onsiteCheckout(
  jobId: number,
): Promise<{ gig: CustomJob; payout: DailyPayout }> {
  return post<{ gig: CustomJob; payout: DailyPayout }>(
    "/borongan/onsite/checkout",
    { jobId },
  );
}
