import { useState, useMemo } from "react";
import { CalendarDays, MapPin, Banknote, Building2, MessageSquare, CalendarClock, Clock, SlidersHorizontal, X, ChevronDown } from "lucide-react";
import { CustomJob, paymentUnits, PaymentType } from "@/types/custom-job";
import { JobCategory } from "@/types/escrow";
import { Button } from "@/components/ui/button";

interface ScheduledJobsFeedProps {
  jobs: CustomJob[];
  suspended?: boolean;
  userLat?: number;
  userLng?: number;
  onSelect: (job: CustomJob) => void;
  onChat: (job: CustomJob) => void;
}

function distKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const CATEGORY_LABELS: Record<JobCategory, string> = {
  umum: "Umum",
  terampil: "Terampil",
  profesional: "Profesional",
};

const PAYMENT_LABELS: Record<PaymentType, string> = {
  per_shift: "Per Shift",
  per_hari: "Per Hari",
  per_projek: "Per Proyek",
  per_bulan: "Per Bulan",
};

const DISTANCE_OPTIONS = [
  { label: "Semua jarak", value: 0 },
  { label: "≤ 5 km", value: 5 },
  { label: "≤ 10 km", value: 10 },
  { label: "≤ 20 km", value: 20 },
  { label: "≤ 50 km", value: 50 },
];

/**
 * "📅 Cari Kerja Terjadwal" — the dedicated feed for REGULAR (hiringMode
 * "lama") scheduled jobs. These arrive silently in real time over the network
 * (no buzzer, no flashing overlay), unlike instant broadcasts on the radar.
 */
export default function ScheduledJobsFeed({ jobs, suspended, userLat, userLng, onSelect, onChat }: ScheduledJobsFeedProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [maxDistKm, setMaxDistKm] = useState(0);
  const [filterCategory, setFilterCategory] = useState<JobCategory | "">("");
  const [filterPayment, setFilterPayment] = useState<PaymentType | "">("");
  const [minUpah, setMinUpah] = useState("");
  const [maxUpah, setMaxUpah] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "distance" | "upah_asc" | "upah_desc">("newest");

  const hasLocation = userLat !== undefined && userLng !== undefined;

  const activeFilterCount = [
    maxDistKm > 0,
    filterCategory !== "",
    filterPayment !== "",
    minUpah !== "",
    maxUpah !== "",
  ].filter(Boolean).length;

  const filtered = useMemo(() => {
    let list = [...jobs];

    if (maxDistKm > 0 && hasLocation) {
      list = list.filter((j) => distKm(userLat!, userLng!, j.lat, j.lng) <= maxDistKm);
    }
    if (filterCategory) {
      list = list.filter((j) => j.jobCategory === filterCategory);
    }
    if (filterPayment) {
      list = list.filter((j) => j.pembayaran === filterPayment);
    }
    const minVal = minUpah ? Number(minUpah.replace(/\D/g, "")) : 0;
    const maxVal = maxUpah ? Number(maxUpah.replace(/\D/g, "")) : Infinity;
    if (minVal > 0) list = list.filter((j) => j.nominal >= minVal);
    if (maxVal < Infinity) list = list.filter((j) => j.nominal <= maxVal);

    if (sortBy === "distance" && hasLocation) {
      list.sort((a, b) => distKm(userLat!, userLng!, a.lat, a.lng) - distKm(userLat!, userLng!, b.lat, b.lng));
    } else if (sortBy === "upah_asc") {
      list.sort((a, b) => a.nominal - b.nominal);
    } else if (sortBy === "upah_desc") {
      list.sort((a, b) => b.nominal - a.nominal);
    } else {
      list.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
    }

    return list;
  }, [jobs, maxDistKm, filterCategory, filterPayment, minUpah, maxUpah, sortBy, hasLocation, userLat, userLng]);

  const clearFilters = () => {
    setMaxDistKm(0);
    setFilterCategory("");
    setFilterPayment("");
    setMinUpah("");
    setMaxUpah("");
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="p-4 space-y-3">

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-primary" /> Cari Kerja Terjadwal
            </h2>
            <p className="text-sm text-gray-500">
              {filtered.length} dari {jobs.length} lowongan reguler
            </p>
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`relative flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition-colors shrink-0 ${
              showFilters || activeFilterCount > 0
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filter
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-primary text-white text-[9px] font-black flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black text-gray-700 uppercase tracking-wide">Filter & Urutkan</p>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-red-500 font-bold hover:text-red-600">
                  <X className="w-3 h-3" /> Reset
                </button>
              )}
            </div>

            {/* Sort */}
            <div>
              <p className="text-[11px] font-bold text-gray-500 mb-1.5">Urutkan</p>
              <div className="flex flex-wrap gap-1.5">
                {([
                  { v: "newest", l: "Terbaru" },
                  { v: "distance", l: "Terdekat", disabled: !hasLocation },
                  { v: "upah_asc", l: "Upah ↑" },
                  { v: "upah_desc", l: "Upah ↓" },
                ] as { v: typeof sortBy; l: string; disabled?: boolean }[]).map(({ v, l, disabled }) => (
                  <button
                    key={v}
                    disabled={disabled}
                    onClick={() => setSortBy(v)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      sortBy === v ? "bg-primary text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Distance */}
            {hasLocation && (
              <div>
                <p className="text-[11px] font-bold text-gray-500 mb-1.5">Radius dari lokasi Anda</p>
                <div className="relative">
                  <select
                    value={maxDistKm}
                    onChange={(e) => setMaxDistKm(Number(e.target.value))}
                    className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-700 pr-8 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {DISTANCE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Category */}
            <div>
              <p className="text-[11px] font-bold text-gray-500 mb-1.5">Kategori pekerjaan</p>
              <div className="flex flex-wrap gap-1.5">
                {([
                  { v: "", l: "Semua" },
                  { v: "umum", l: "Umum" },
                  { v: "terampil", l: "Terampil" },
                  { v: "profesional", l: "Profesional" },
                ] as { v: typeof filterCategory; l: string }[]).map(({ v, l }) => (
                  <button
                    key={String(v)}
                    onClick={() => setFilterCategory(v)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                      filterCategory === v ? "bg-primary text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Payment type */}
            <div>
              <p className="text-[11px] font-bold text-gray-500 mb-1.5">Tipe pembayaran</p>
              <div className="flex flex-wrap gap-1.5">
                {([
                  { v: "", l: "Semua" },
                  { v: "per_shift", l: "Shift" },
                  { v: "per_hari", l: "Harian" },
                  { v: "per_projek", l: "Proyek" },
                  { v: "per_bulan", l: "Bulanan" },
                ] as { v: typeof filterPayment; l: string }[]).map(({ v, l }) => (
                  <button
                    key={String(v)}
                    onClick={() => setFilterPayment(v)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                      filterPayment === v ? "bg-primary text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Wage range */}
            <div>
              <p className="text-[11px] font-bold text-gray-500 mb-1.5">Kisaran upah (Rp)</p>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  placeholder="Min"
                  value={minUpah}
                  onChange={(e) => setMinUpah(e.target.value)}
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="text-gray-400 text-sm">—</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={maxUpah}
                  onChange={(e) => setMaxUpah(e.target.value)}
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
          </div>
        )}

        {/* Job list */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
              <CalendarDays className="w-8 h-8 text-emerald-300" />
            </div>
            <p className="font-bold text-gray-700 text-sm">
              {jobs.length === 0 ? "Belum ada lowongan terjadwal" : "Tidak ada lowongan yang cocok"}
            </p>
            <p className="text-xs text-gray-400 leading-relaxed max-w-[240px]">
              {jobs.length === 0
                ? "Lowongan \"Posting Reguler\" dari perusahaan akan tampil di sini secara otomatis — tanpa alarm."
                : "Coba ubah atau reset filter untuk melihat lebih banyak lowongan."}
            </p>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="text-xs font-bold text-primary underline underline-offset-2">
                Reset filter
              </button>
            )}
          </div>
        ) : (
          filtered.map((job) => {
            const km = hasLocation
              ? distKm(userLat!, userLng!, job.lat, job.lng).toFixed(1)
              : null;
            return (
              <div
                key={job.id}
                data-testid={`card-scheduled-job-${job.id}`}
                className="bg-white p-4 rounded-xl border border-emerald-100 shadow-sm flex flex-col gap-3"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 truncate">{job.posisi}</h3>
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                      <Building2 className="w-3 h-3 shrink-0 text-primary" />
                      <span className="truncate">{job.namaPerusahaan || "Rekhastha by Tilu Company"}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 ml-2 shrink-0 flex-wrap justify-end">
                    {job.jobCategory && (
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        job.jobCategory === "profesional" ? "bg-purple-100 text-purple-700" :
                        job.jobCategory === "terampil" ? "bg-blue-100 text-blue-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {CATEGORY_LABELS[job.jobCategory]}
                      </span>
                    )}
                    <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                      📅 Terjadwal
                    </span>
                  </div>
                </div>

                {job.deskripsi && <p className="text-sm text-gray-600 line-clamp-2">{job.deskripsi}</p>}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Banknote className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-black text-gray-900">
                      Rp {job.nominal.toLocaleString("id-ID")} / {paymentUnits[job.pembayaran]}
                    </span>
                  </div>
                  {km !== null && (
                    <div className="flex items-center gap-1 text-[11px] text-gray-400 font-semibold">
                      <MapPin className="w-3 h-3" /> {km} km
                    </div>
                  )}
                </div>

                {(job.jobDate || job.jamKerja || job.alamat) && (
                  <div className="flex flex-col gap-1.5 bg-emerald-50/60 border border-emerald-100 rounded-lg px-2.5 py-2 text-[11px] text-gray-600">
                    {job.jobDate && (
                      <span className="flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        {new Date(job.jobDate).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                      </span>
                    )}
                    {job.jamKerja && (
                      <span className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> {job.jamKerja}
                      </span>
                    )}
                    {job.alamat && (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="line-clamp-1">{job.alamat}</span>
                      </span>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    disabled={suspended}
                    className={`flex-1 font-semibold ${suspended ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-primary hover:bg-primary/90 text-white"}`}
                    onClick={() => !suspended && onSelect(job)}
                  >
                    {suspended ? "Ditangguhkan" : "Detail & Lamar"}
                  </Button>
                  <button
                    onClick={() => onChat(job)}
                    className="px-3 py-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-colors flex items-center justify-center"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
