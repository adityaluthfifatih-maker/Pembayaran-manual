/**
 * Browser client for the employer → worker blacklist.
 *
 * An employer blocks a worker from the post-shift rating modal; the worker's
 * device fetches which employer ids blocked it and hides every gig from those
 * employers (pins + cards).
 */

const API_BASE = "/api";

export interface BlacklistRow {
  id: number;
  employerId: string;
  employerName: string;
  workerName: string;
  jobId: number | null;
  createdAt: string;
}

/** Employer: block a worker (idempotent). */
export async function createBlacklist(params: {
  employerId: string;
  employerName: string;
  workerName: string;
  jobId?: number | null;
}): Promise<void> {
  await fetch(`${API_BASE}/blacklist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

/** Worker: fetch the employer ids that have blacklisted this worker. */
export async function fetchEmployerIdsBlockingWorker(
  workerName: string,
): Promise<Set<string>> {
  try {
    const res = await fetch(
      `${API_BASE}/blacklist?workerName=${encodeURIComponent(workerName)}`,
    );
    if (!res.ok) return new Set();
    const rows = (await res.json()) as BlacklistRow[];
    return new Set(rows.map((r) => r.employerId));
  } catch {
    return new Set();
  }
}
