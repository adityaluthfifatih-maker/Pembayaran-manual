const API_BASE = "/api";

export interface RadarStats {
  count: number;
  radiusKm: number;
  isPremium: boolean;
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

export async function fetchRadarStats(
  lat?: number,
  lng?: number,
  radiusKm?: number,
): Promise<RadarStats> {
  const params = new URLSearchParams();
  if (lat !== undefined) params.set("lat", String(lat));
  if (lng !== undefined) params.set("lng", String(lng));
  if (radiusKm !== undefined) params.set("radiusKm", String(radiusKm));
  const qs = params.toString();
  const res = await fetch(`${API_BASE}/companies/radar-stats${qs ? `?${qs}` : ""}`, {
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Gagal memuat statistik radar pekerja.");
  }
  return res.json();
}
