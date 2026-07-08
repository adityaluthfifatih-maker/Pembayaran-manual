import { useCallback, useEffect, useState } from "react";
import { Radar as RadarIcon, RefreshCw, Zap, Crown } from "lucide-react";
import { fetchRadarStats, postCompanyLocation } from "@/lib/radar-client";
import { subscribePremium } from "@/lib/monetization-client";
import { SUBSCRIPTION_PRICE_MONTHLY } from "@/types/monetization";

const JAKARTA_CENTER = { lat: -6.2088, lng: 106.8456 };

interface CompanyRadarStatsProps {
  onGoInstant: () => void;
}

/**
 * Text-only "Radar Pekerja Terdekat" stat. Replaces the old company radar
 * map (react-leaflet pins showing worker location + unlocked WhatsApp
 * numbers): that visual exposed approximate worker home locations and let
 * premium companies contact workers directly, bypassing the platform's
 * escrow/fee flow. This view only ever shows an aggregate headcount.
 */
export default function CompanyRadarStats({ onGoInstant }: CompanyRadarStatsProps) {
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusKm, setRadiusKm] = useState<3 | 5>(5);
  const [count, setCount] = useState<number | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback((lat: number, lng: number, radius: 3 | 5) => {
    setLoading(true);
    setError(null);
    fetchRadarStats(lat, lng, radius)
      .then((data) => {
        setCount(data.count);
        setIsPremium(data.isPremium);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat statistik radar."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setOrigin(JAKARTA_CENTER);
      loadStats(JAKARTA_CENTER.lat, JAKARTA_CENTER.lng, radiusKm);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const loc = { lat: p.coords.latitude, lng: p.coords.longitude };
        setOrigin(loc);
        void postCompanyLocation(loc.lat, loc.lng);
        loadStats(loc.lat, loc.lng, radiusKm);
      },
      () => {
        setOrigin(JAKARTA_CENTER);
        loadStats(JAKARTA_CENTER.lat, JAKARTA_CENTER.lng, radiusKm);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRadiusChange = (radius: 3 | 5) => {
    setRadiusKm(radius);
    if (origin) loadStats(origin.lat, origin.lng, radius);
  };

  const handleRefresh = () => {
    if (origin) loadStats(origin.lat, origin.lng, radiusKm);
  };

  const handleUpgrade = useCallback(async () => {
    if (subscribing) return;
    setSubscribing(true);
    try {
      await subscribePremium();
      setIsPremium(true);
      if (origin) loadStats(origin.lat, origin.lng, radiusKm);
    } catch {
      setError("Gagal memproses langganan Premium. Coba lagi.");
    } finally {
      setSubscribing(false);
    }
  }, [subscribing, origin, radiusKm, loadStats]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 bg-gradient-to-b from-blue-50 to-white">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 rounded-2xl bg-blue-700 flex items-center justify-center shadow-lg">
            <RadarIcon className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-lg font-black text-gray-900">Radar Pekerja Terdekat</h2>
          <p className="text-xs text-gray-500">
            Estimasi jumlah pekerja aktif di sekitar lokasi bisnis Anda — tanpa menampilkan identitas atau lokasi pasti pekerja, demi menjaga privasi &amp; keamanan transaksi.
          </p>
        </div>

        {/* Radius toggle */}
        <div className="flex justify-center gap-2">
          {([3, 5] as const).map((r) => (
            <button
              key={r}
              onClick={() => handleRadiusChange(r)}
              disabled={loading}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
                radiusKm === r ? "bg-blue-700 text-white" : "bg-white border border-gray-200 text-gray-500"
              }`}
            >
              {r} km
            </button>
          ))}
        </div>

        {/* Stat card */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm px-6 py-8">
          {loading ? (
            <p className="text-sm text-gray-400">Memuat data radar...</p>
          ) : error ? (
            <p className="text-sm text-red-600 font-semibold">{error}</p>
          ) : (
            <>
              <p className="text-5xl font-black text-blue-700 tabular-nums">{count ?? 0}</p>
              <p className="text-sm font-bold text-gray-800 mt-2">
                Ada <span className="text-blue-700">{count ?? 0}</span> pekerja yang siap kerja di sekitar Anda
              </p>
              <p className="text-[11px] text-gray-400 mt-1">dalam radius {radiusKm} km dari lokasi bisnis Anda</p>
            </>
          )}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-700 hover:underline disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Muat ulang
          </button>
        </div>

        {/* CTA buttons */}
        <div className="space-y-2.5">
          <button
            onClick={onGoInstant}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-bold py-3.5 rounded-2xl shadow-lg hover:opacity-90 transition-opacity"
          >
            <Zap className="w-4 h-4" /> Gunakan Mode Instan Sekarang
          </button>
          {!isPremium && (
            <button
              onClick={handleUpgrade}
              disabled={subscribing}
              className="w-full flex items-center justify-center gap-2 bg-slate-900 text-amber-400 text-sm font-bold py-3.5 rounded-2xl hover:bg-slate-800 transition-colors disabled:opacity-60"
            >
              <Crown className="w-4 h-4" />
              {subscribing
                ? "Memproses..."
                : `Upgrade Premium (Rp${SUBSCRIPTION_PRICE_MONTHLY.toLocaleString("id-ID")}/bln)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
