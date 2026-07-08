const API_BASE = "/api";

export interface RadarWorker {
  id: string;
  firstName: string;
  skills: string[];
  distanceKm: number;
  lat: number;
  lng: number;
  whatsapp: string | null;
  contactLocked: boolean;
}

export interface RadarResponse {
  workers: RadarWorker[];
  isPremium: boolean;
  radiusKm: number;
}

export async function postWorkerLocation(
  lat: number,
  lng: number,
  isReadyToWork?: boolean,
): Promise<void> {
  await fetch(`${API_BASE}/workers/location`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng, isReadyToWork }),
  });
}

export async function postCompanyLocation(lat: number, lng: number): Promise<void> {
  await fetch(`${API_BASE}/companies/location`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng }),
  });
}

export async function fetchRadar(lat?: number, lng?: number): Promise<RadarResponse> {
  const params = new URLSearchParams();
  if (lat !== undefined) params.set("lat", String(lat));
  if (lng !== undefined) params.set("lng", String(lng));
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/companies/radar${qs ? `?${qs}` : ""}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Gagal memuat radar pekerja.");
  }
  return res.json();
}
