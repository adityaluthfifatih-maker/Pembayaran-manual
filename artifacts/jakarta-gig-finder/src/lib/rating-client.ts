/**
 * Browser client for persisting post-shift ratings. The rater identity is taken
 * from the httpOnly session on the server, so `credentials: "include"` is
 * required. Failures are swallowed: a missing rating must never block the UI.
 */
const API_BASE = "/api";

export async function submitRating(params: {
  targetName: string;
  stars: number;
  comment?: string;
  raterType: "company" | "worker";
  jobId?: number | null;
}): Promise<void> {
  try {
    await fetch(`${API_BASE}/ratings`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch {
    /* best effort — the local UI already reflects the rating */
  }
}
