import { useCallback, useEffect, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Circle, Tooltip, Popup } from "react-leaflet";
import { Lock, Crown, RefreshCw, Radar as RadarIcon } from "lucide-react";
import { fetchRadar, postCompanyLocation, RadarWorker } from "@/lib/radar-client";
import { subscribePremium } from "@/lib/monetization-client";
import { SUBSCRIPTION_PRICE_MONTHLY } from "@/types/monetization";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const JAKARTA_CENTER = { lat: -6.2088, lng: 106.8456 };

const createCompanyIcon = () =>
  L.divIcon({
    className: "",
    html: `<div style="width:26px;height:26px;border-radius:8px;background:#1D4ED8;border:3px solid white;box-shadow:0 2px 10px rgba(29,78,216,0.5);display:flex;align-items:center;justify-content:center;color:white;font-size:13px;font-weight:900;line-height:1">🏢</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });

const createWorkerIcon = () =>
  L.divIcon({
    className: "",
    html: `
      <div style="position:relative;width:36px;height:36px;display:flex;align-items:center;justify-content:center">
        <div style="position:absolute;inset:0;border-radius:50%;background:#059669;opacity:0.2;animation:radarPulse 2s ease-out infinite"></div>
        <div style="width:18px;height:18px;border-radius:50%;background:#059669;border:3px solid white;box-shadow:0 2px 8px rgba(5,150,105,0.5);z-index:1;position:relative"></div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });

export default function CompanyRadarMap() {
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [workers, setWorkers] = useState<RadarWorker[]>([]);
  const [radiusKm, setRadiusKm] = useState(5);
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRadar = useCallback((lat: number, lng: number) => {
    setLoading(true);
    setError(null);
    fetchRadar(lat, lng)
      .then((data) => {
        setWorkers(data.workers);
        setRadiusKm(data.radiusKm);
        setIsPremium(data.isPremium);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat radar."))
      .finally(() => setLoading(false));
  }, []);

  const handleUpgrade = useCallback(async () => {
    if (subscribing) return;
    setSubscribing(true);
    try {
      await subscribePremium();
      setIsPremium(true);
      if (origin) loadRadar(origin.lat, origin.lng);
    } catch {
      setError("Gagal memproses langganan Premium. Coba lagi.");
    } finally {
      setSubscribing(false);
    }
  }, [subscribing, origin, loadRadar]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setOrigin(JAKARTA_CENTER);
      loadRadar(JAKARTA_CENTER.lat, JAKARTA_CENTER.lng);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const loc = { lat: p.coords.latitude, lng: p.coords.longitude };
        setOrigin(loc);
        void postCompanyLocation(loc.lat, loc.lng);
        loadRadar(loc.lat, loc.lng);
      },
      () => {
        setOrigin(JAKARTA_CENTER);
        loadRadar(JAKARTA_CENTER.lat, JAKARTA_CENTER.lng);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!origin) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Mengambil lokasi perusahaan...
      </div>
    );
  }

  return (
    <div className="flex-1 relative">
      <MapContainer center={[origin.lat, origin.lng]} zoom={13} style={{ height: "100%", width: "100%" }} zoomControl={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        <Circle
          center={[origin.lat, origin.lng]}
          radius={radiusKm * 1000}
          pathOptions={{ color: "#1D4ED8", fillColor: "#1D4ED8", fillOpacity: 0.06, weight: 1.5, dashArray: "6 6" }}
        />
        <Marker position={[origin.lat, origin.lng]} icon={createCompanyIcon()}>
          <Tooltip permanent direction="top" offset={[0, -16]} className="!bg-blue-700 !text-white !text-[10px] !font-semibold !border-0 !rounded-lg !shadow-lg">
            Lokasi Perusahaan
          </Tooltip>
        </Marker>

        {workers.map((w) => (
          <Marker key={w.id} position={[w.lat, w.lng]} icon={createWorkerIcon()}>
            <Popup>
              <div className="text-xs space-y-1 min-w-[160px]">
                <p className="font-black text-sm text-gray-900">{w.firstName}</p>
                <p className="text-gray-500">±{w.distanceKm} km dari lokasi Anda</p>
                {w.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {w.skills.map((s) => (
                      <span key={s} className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-semibold text-[10px]">
                        {s}
                      </span>
                    ))}
                  </div>
                )}
                <div className="pt-1.5 border-t border-gray-100">
                  {w.contactLocked ? (
                    <button
                      onClick={handleUpgrade}
                      disabled={subscribing}
                      className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-lg w-full justify-center disabled:opacity-60"
                    >
                      <Lock className="w-3 h-3" /> {subscribing ? "Memproses..." : "Buka Kontak (Premium)"}
                    </button>
                  ) : (
                    <p className="font-bold text-primary text-[11px]">📱 {w.whatsapp ?? "-"}</p>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      <style>{`
        @keyframes radarPulse {
          0%   { transform: scale(0.7); opacity: 0.8; }
          100% { transform: scale(2.4); opacity: 0; }
        }
      `}</style>

      <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 z-[1000] pointer-events-none">
        <div className="bg-white/95 backdrop-blur px-3 py-2 rounded-xl shadow-lg flex items-center gap-2 pointer-events-auto">
          <RadarIcon className="w-4 h-4 text-blue-700" />
          <div>
            <p className="text-xs font-black text-gray-900 leading-tight">Radar Pekerja Terdekat</p>
            <p className="text-[10px] text-gray-500 leading-tight">
              {loading ? "Memuat..." : `${workers.length} pekerja siap kerja dalam ${radiusKm} km`}
            </p>
          </div>
        </div>
        <button
          onClick={() => loadRadar(origin.lat, origin.lng)}
          className="bg-white/95 backdrop-blur p-2.5 rounded-xl shadow-lg pointer-events-auto"
          title="Muat ulang"
        >
          <RefreshCw className={`w-4 h-4 text-blue-700 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {!isPremium && workers.length > 0 && (
        <div className="absolute bottom-3 left-3 right-3 z-[1000]">
          <button
            onClick={handleUpgrade}
            disabled={subscribing}
            className="w-full bg-gradient-to-r from-amber-500 to-amber-600 text-white text-xs font-bold px-4 py-3 rounded-xl shadow-lg flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Crown className="w-4 h-4" />
            {subscribing
              ? "Memproses..."
              : `Upgrade Premium (Rp${SUBSCRIPTION_PRICE_MONTHLY.toLocaleString("id-ID")}/bln) untuk buka kontak pekerja`}
          </button>
        </div>
      )}

      {error && (
        <div className="absolute inset-x-3 top-16 z-[1000] bg-red-50 border border-red-200 text-red-700 text-xs font-semibold px-3 py-2 rounded-xl">
          {error}
        </div>
      )}
    </div>
  );
}
