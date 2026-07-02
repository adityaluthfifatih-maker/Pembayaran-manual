import type { BoronganType } from "@/types/custom-job";

/**
 * Worker silent SOS client.
 *
 * Reports an emergency to the server (which persists it as `emergency_active`
 * and fans it out to the Admin Command Center). This intentionally never dials
 * a phone number or uses a `tel:` protocol — the admin is the human dispatcher.
 */
const API_BASE = "/api";

export interface EmergencyReport {
  jobId?: number;
  workerPhone?: string;
  jobTitle?: string;
  employerName?: string;
  projectAddress?: string;
  boronganType?: BoronganType;
}

export async function reportEmergency(payload: EmergencyReport): Promise<void> {
  const res = await fetch(`${API_BASE}/emergency`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error((msg as { error?: string }).error ?? "Gagal mengirim laporan darurat.");
  }
}
