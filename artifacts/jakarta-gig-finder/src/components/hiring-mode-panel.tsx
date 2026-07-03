import { useState, useMemo, useCallback } from "react";
import LocationPickerSection from "@/components/location-picker-section";
import {
  Zap, CalendarDays, Lock, LockOpen, Radio, Users, Banknote,
  CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Star,
  MapPin, Clock, MessageSquare, Filter, ShieldCheck, Briefcase,
  QrCode, XCircle,
} from "lucide-react";
import { CustomJob, PaymentType, HiringMode, paymentLabels, paymentInputLabels, paymentUnits } from "@/types/custom-job";
import { ApplicationNotification, ApplicationStatus, maskName } from "@/types/notification";
import { JobCategory, PLATFORM_FEE_RATES, getFeeRate, DEFAULT_FEE_RATE, CANCELLATION_FEE_1HR } from "@/types/escrow";
import { AuthUser } from "@/types/auth";

interface HiringModePanelProps {
  currentUser: AuthUser;
  customJobs: CustomJob[];
  notifications: ApplicationNotification[];
  onJobPosted: (data: Omit<CustomJob, "id" | "type" | "lat" | "lng" | "postedAt"> & { lat?: number; lng?: number }) => void;
  onLockEscrow: (jobId: number, escrowAmount: number) => void;
  onDispute: (jobId: number) => void;
  onStatusChange: (notifId: number, status: ApplicationStatus) => void;
  onCancelJob?: (jobId: number, deductFee: boolean) => void;
}

// QR matrix for employer display (21×21, same design as worker scanner)
const QR_MATRIX = [
  [1,1,1,1,1,1,1,0,0,1,0,1,0,0,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,1,0,1,0,0,0,1,0,1,0,0,0,0,0,1],
  [1,0,1,1,1,0,1,0,0,1,0,1,0,0,1,0,1,1,1,0,1],
  [1,0,1,1,1,0,1,0,1,1,1,0,1,0,1,0,1,1,1,0,1],
  [1,0,1,1,1,0,1,0,0,0,0,1,0,0,1,0,1,1,1,0,1],
  [1,0,0,0,0,0,1,0,1,0,1,0,0,0,1,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,0,1,0,1,0,1,0,1,1,1,1,1,1,1],
  [0,0,0,0,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0,0,0],
  [0,1,0,1,1,0,1,1,1,0,1,0,1,1,0,1,1,0,1,0,1],
  [1,0,1,0,0,1,0,1,0,1,1,0,0,1,0,0,1,1,0,1,0],
  [0,1,1,0,1,0,1,0,1,0,0,1,1,0,1,0,0,1,1,0,1],
  [1,0,0,1,0,1,0,1,0,1,0,0,1,1,0,1,0,0,1,0,0],
  [0,0,1,0,1,0,1,0,1,1,0,1,0,0,1,0,1,1,0,1,0],
  [0,0,0,0,0,0,0,0,1,0,1,0,1,0,0,1,0,1,0,1,1],
  [1,1,1,1,1,1,1,0,0,1,0,1,0,1,1,0,1,1,1,0,1],
  [1,0,0,0,0,0,1,0,1,0,1,0,1,0,0,1,0,0,0,1,0],
  [1,0,1,1,1,0,1,0,0,1,0,1,0,1,1,0,1,0,1,0,1],
  [1,0,1,1,1,0,1,0,1,0,1,0,1,0,0,1,1,1,0,1,0],
  [1,0,1,1,1,0,1,0,0,1,1,0,0,1,1,0,0,1,1,0,1],
  [1,0,0,0,0,0,1,0,1,0,0,1,0,0,1,0,1,0,0,1,0],
  [1,1,1,1,1,1,1,0,1,1,0,0,1,1,0,1,0,1,0,1,1],
];

function EmployerQRDisplay() {
  return (
    <div className="bg-white p-2 rounded-xl border-2 border-gray-800 inline-block">
      {QR_MATRIX.map((row, r) => (
        <div key={r} className="flex">
          {row.map((cell, c) => (
            <div key={c} style={{ width: 7, height: 7, backgroundColor: cell ? "#111827" : "#ffffff" }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Named standby Mitra pins shown on the Butuh Cepat broadcast radar
const RADAR_WORKERS = [
  { name: "Ahmad", top: "24%", left: "28%", km: "1.2" },
  { name: "Rian",  top: "60%", left: "70%", km: "2.4" },
  { name: "Siti",  top: "42%", left: "52%", km: "0.8" },
];

function BroadcastRadar() {
  return (
    <div className="relative mx-auto w-full h-44 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 overflow-hidden">
      {/* Radar rings */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {[1, 2, 3].map(i => (
          <div
            key={i}
            className="absolute rounded-full border-2 border-orange-400/40"
            style={{
              width: `${i * 72}px`,
              height: `${i * 72}px`,
              animation: "radar-expand 2.2s ease-out infinite",
              animationDelay: `${(i - 1) * 0.6}s`,
            }}
          />
        ))}
        <div className="absolute w-3.5 h-3.5 rounded-full bg-orange-500 border-2 border-white shadow-lg" />
      </div>

      {/* Named standby worker pins */}
      {RADAR_WORKERS.map(w => (
        <div
          key={w.name}
          className="absolute flex flex-col items-center gap-1 -translate-x-1/2 -translate-y-1/2"
          style={{ top: w.top, left: w.left }}
        >
          <div className="w-7 h-7 rounded-full bg-white border-2 border-emerald-500 flex items-center justify-center text-[11px] font-black text-emerald-700 shadow-md">
            {w.name.slice(0, 1)}
          </div>
          <span className="flex items-center gap-0.5 text-[9px] font-bold text-gray-800 bg-white/95 px-1.5 py-0.5 rounded-full shadow-sm whitespace-nowrap">
            <ShieldCheck className="w-2.5 h-2.5 text-emerald-600 shrink-0" /> {w.name} · {w.km} km
          </span>
        </div>
      ))}

      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] font-semibold text-orange-700 bg-white/85 px-2 py-0.5 rounded-full whitespace-nowrap">
        📡 Mitra standby terdekat: Ahmad · Rian · Siti
      </div>
    </div>
  );
}

type BroadcastState = "idle" | "locking" | "broadcasting" | "done";
type SortKey = "rating" | "jarak";

function formatRp(n: number) {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

// Simulated worker ratings for demo applicants
const DEMO_RATINGS: Record<string, number> = {};
function getRating(name: string): number {
  if (!DEMO_RATINGS[name]) DEMO_RATINGS[name] = +(3.8 + Math.random() * 1.2).toFixed(1);
  return DEMO_RATINGS[name];
}
function getDemoKm(name: string): number {
  if (!DEMO_RATINGS[name + "_km"]) DEMO_RATINGS[name + "_km"] = +(0.5 + Math.random() * 4.5).toFixed(1);
  return DEMO_RATINGS[name + "_km"];
}

export default function HiringModePanel({
  currentUser, customJobs, notifications,
  onJobPosted, onLockEscrow, onDispute, onStatusChange, onCancelJob,
}: HiringModePanelProps) {

  // ── Mode toggle ────────────────────────────────────────────────
  const [hiringMode, setHiringMode] = useState<HiringMode>("cepat");

  // ── Form state ────────────────────────────────────────────────
  const [formOpen, setFormOpen] = useState(true);
  const [posisi, setPosisi] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [pembayaran, setPembayaran] = useState<PaymentType>("per_shift");
  const [nominalRaw, setNominalRaw] = useState("");
  const [kuota, setKuota] = useState("1");
  const [namaPerusahaan, setNamaPerusahaan] = useState(currentUser.name || "");
  const [dresscode, setDresscode] = useState("Bebas rapi");
  const [jobCategory, setJobCategory] = useState<JobCategory>("terampil");
  const [showFeeExplanation, setShowFeeExplanation] = useState(false);

  // ── Posting Reguler (scheduled) extra fields ──────────────────
  const todayStr = new Date().toISOString().split("T")[0];
  const [tanggalMulai, setTanggalMulai] = useState("");
  const [jamKerja, setJamKerja] = useState("");
  const [pickerAddress, setPickerAddress] = useState("");
  const [pickerLat, setPickerLat] = useState<number | null>(null);
  const [pickerLng, setPickerLng] = useState<number | null>(null);

  const handleLocationChange = useCallback((lat: number, lng: number, address: string) => {
    setPickerLat(lat);
    setPickerLng(lng);
    setPickerAddress(address);
  }, []);

  // ── Butuh Cepat state ─────────────────────────────────────────
  const [broadcastState, setBroadcastState] = useState<BroadcastState>("idle");
  const [broadcastCount, setBroadcastCount] = useState(0);
  const [lastBroadcastJob, setLastBroadcastJob] = useState<string>("");
  const [showCepatConfirm, setShowCepatConfirm] = useState(false);

  // ── Bisa Lama state ───────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>("rating");
  const [escrowConfirmJobId, setEscrowConfirmJobId] = useState<number | null>(null);
  const [lockedJobIds, setLockedJobIds] = useState<Set<number>>(new Set());
  const [expandedJobId, setExpandedJobId] = useState<number | null>(null);

  // ── Loophole mitigation state ─────────────────────────────────
  const [lockedAtMap, setLockedAtMap] = useState<Record<number, Date>>({});
  const [cancelConfirmJobId, setCancelConfirmJobId] = useState<number | null>(null);
  const [showQrJobId, setShowQrJobId] = useState<number | null>(null);

  // ── Derived calc ──────────────────────────────────────────────
  const nominalNum = parseInt(nominalRaw.replace(/\D/g, "")) || 0;
  const kuotaNum = Math.max(1, parseInt(kuota) || 1);
  const feeRate = getFeeRate(jobCategory);
  const upahPokok = nominalNum * kuotaNum;
  const biayaSistem = Math.round(upahPokok * feeRate);
  const totalEscrow = upahPokok + biayaSistem;
  const isEscrowLocked = broadcastState === "done" && hiringMode === "cepat";
  const baseValid = posisi.trim().length >= 3 && nominalNum >= 10_000;
  const catatanValid = deskripsi.trim().length > 0;
  const formValid =
    hiringMode === "cepat"
      ? baseValid && catatanValid
      : baseValid && catatanValid && tanggalMulai !== "" && jamKerja.trim() !== "" && pickerAddress.trim() !== "";

  // ── Mode-filtered job lists ───────────────────────────────────
  const cepatJobs = useMemo(() => customJobs.filter(j => j.hiringMode === "cepat"), [customJobs]);
  const lamaJobs  = useMemo(() => customJobs.filter(j => j.hiringMode === "lama"),  [customJobs]);
  const legacyJobs = useMemo(() => customJobs.filter(j => !j.hiringMode),           [customJobs]);

  const handleNominalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    setNominalRaw(raw ? parseInt(raw).toLocaleString("id-ID") : "");
  };

  // ── Submit Broadcast Instan ────────────────────────────────────
  const handleCepatSubmit = () => {
    if (!formValid || broadcastState !== "idle") return;
    // Force-fetch device GPS (permission prompt) — location is auto-locked to a 5km radar radius.
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(() => {}, () => {}, {
        enableHighAccuracy: true, timeout: 8000, maximumAge: 5000,
      });
    }
    setBroadcastState("locking");

    setTimeout(() => {
      setBroadcastState("broadcasting");
      const count = Math.floor(Math.random() * 16) + 5;
      setBroadcastCount(count);
      setLastBroadcastJob(posisi);

      onJobPosted({
        posisi: posisi.trim(),
        deskripsi: deskripsi.trim() || `Dibutuhkan segera ${posisi} di Jakarta. Gaji langsung melalui escrow Rekhastha.`,
        pembayaran,
        nominal: nominalNum,
        dresscode,
        kuota: kuotaNum,
        namaPerusahaan,
        hiringMode: "cepat",
        broadcastActive: true,
        escrowStatus: "locked",
        escrowAmount: totalEscrow,
        durasiKontrak: "harian",
        jobDate: new Date(), // AUTOMATED DATE — always today for instant broadcasts
        jobCategory,
        feeRate,
      });

      setTimeout(() => {
        setBroadcastState("done");
        setTimeout(() => {
          resetForm();
          setBroadcastState("idle");
          setFormOpen(false);
        }, 4000);
      }, 1500);
    }, 1800);
  };

  // ── Submit Posting Reguler (scheduled marketplace listing) ─────
  const handleLamaSubmit = () => {
    if (!formValid) return;
    onJobPosted({
      posisi: posisi.trim(),
      deskripsi: deskripsi.trim() || `Lowongan ${posisi} untuk kontrak terjadwal. Dikelola melalui escrow Rekhastha.`,
      pembayaran,
      nominal: nominalNum,
      dresscode,
      kuota: kuotaNum,
      namaPerusahaan,
      hiringMode: "lama",
      broadcastActive: false,
      escrowStatus: "pending",
      durasiKontrak: "harian",
      jobDate: tanggalMulai ? new Date(tanggalMulai) : undefined,
      jamKerja: jamKerja.trim(),
      alamat: pickerAddress.trim(),
      ...(pickerLat !== null && pickerLng !== null ? { lat: pickerLat, lng: pickerLng } : {}),
      jobCategory,
      feeRate,
    });
    resetForm();
    setFormOpen(false);
  };

  const resetForm = () => {
    setPosisi(""); setDeskripsi(""); setNominalRaw(""); setKuota("1");
    setJobCategory("terampil");
    setTanggalMulai(""); setJamKerja(""); setPickerAddress(""); setPickerLat(null); setPickerLng(null);
  };

  // ── Lock escrow for Bisa Lama after candidate selection ────────
  const handleConfirmEscrow = (jobId: number) => {
    const job = customJobs.find(j => j.id === jobId);
    if (!job) return;
    const jobFeeRate = job.feeRate ?? DEFAULT_FEE_RATE;
    const jumlahHari = job.jumlahHari ?? 1;
    const amount = Math.round(job.nominal * jumlahHari * job.kuota * (1 + jobFeeRate));
    onLockEscrow(jobId, amount);
    setLockedJobIds(prev => new Set([...prev, jobId]));
    setLockedAtMap(prev => ({ ...prev, [jobId]: new Date() }));
    // Accept all "ditinjau" applicants for this job
    notifications
      .filter(n => n.jobId === jobId && n.status === "ditinjau")
      .forEach(n => onStatusChange(n.id, "diterima"));
    setEscrowConfirmJobId(null);
  };

  // ── Cancel job with compensation check ─────────────────────────
  const handleCancelJobConfirm = (jobId: number) => {
    const lockedAt = lockedAtMap[jobId];
    const within1hr = lockedAt
      ? (Date.now() - lockedAt.getTime()) < 3_600_000
      : true; // Cepat jobs are considered always within 1hr for demo
    onCancelJob?.(jobId, within1hr);
    setCancelConfirmJobId(null);
  };

  // ── Applicant sort ─────────────────────────────────────────────
  const sortedApplicants = (jobId: number) => {
    const list = notifications.filter(n => n.jobId === jobId);
    return [...list].sort((a, b) =>
      sortKey === "rating"
        ? getRating(b.applicantName) - getRating(a.applicantName)
        : getDemoKm(a.applicantName) - getDemoKm(b.applicantName)
    );
  };

  const inputCls = "w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl placeholder-gray-400 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-400 transition-all";
  const labelCls = "text-xs font-semibold text-gray-700 mb-1 block";

  return (
    <>
    {/* ── Cepat Broadcast Fee Confirmation Modal ───────────────── */}
    {showCepatConfirm && (
      <div className="fixed inset-0 z-[250] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
        <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-4">
          {/* Header */}
          <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6 text-orange-500" />
          </div>
          <div className="text-center">
            <h3 className="font-black text-gray-900">Konfirmasi Kunci Escrow</h3>
            <p className="text-sm text-gray-500 mt-1">
              Periksa rincian biaya sebelum broadcast dikirimkan
            </p>
          </div>

          {/* Fee breakdown */}
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center gap-2 mb-1">
              <Banknote className="w-4 h-4 text-orange-600 shrink-0" />
              <span className="text-xs font-bold text-orange-800">Rincian Dana Escrow</span>
              <span className="ml-auto text-[10px] font-black px-2 py-0.5 rounded-full bg-orange-200 text-orange-800">
                {Math.round(feeRate * 100)}% TERKUNCI
              </span>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-gray-700">
                <span>Upah Bersih Pekerja ({kuotaNum} orang)</span>
                <span className="font-semibold text-emerald-700">{formatRp(upahPokok)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Biaya Platform Rekhastha ({Math.round(feeRate * 100)}% Beban Perusahaan)</span>
                <span className="font-semibold">{formatRp(biayaSistem)}</span>
              </div>
              <div className="flex justify-between font-bold border-t border-orange-200 pt-2 text-sm text-orange-900">
                <span>Total Dana yang Dititipkan ke Escrow</span>
                <span>{formatRp(totalEscrow)}</span>
              </div>
            </div>
            <p className="text-[10px] text-emerald-700/80 leading-relaxed pt-0.5">
              🟢 Pekerja menerima 100% upah utuh — biaya platform sepenuhnya ditanggung perusahaan.
            </p>
          </div>

          {/* Posisi label */}
          <p className="text-[11px] text-gray-500 text-center">
            Posisi: <span className="font-bold text-gray-800">{posisi}</span> · Broadcast ke radius 5km
          </p>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => { setShowCepatConfirm(false); handleCepatSubmit(); }}
              className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3 rounded-xl text-sm shadow-md active:scale-[0.98] transition-all">
              🔒 Kunci &amp; Broadcast
            </button>
            <button
              onClick={() => setShowCepatConfirm(false)}
              className="flex-1 bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl text-sm hover:bg-gray-200 transition-colors">
              Batal
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Cancel Confirmation Modal ────────────────────────────── */}
    {cancelConfirmJobId !== null && (() => {
      const job = customJobs.find(j => j.id === cancelConfirmJobId);
      const lockedAt = lockedAtMap[cancelConfirmJobId];
      const within1hr = lockedAt
        ? (Date.now() - lockedAt.getTime()) < 3_600_000
        : true;
      return (
        <div className="fixed inset-0 z-[250] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="bg-white rounded-3xl w-full max-w-sm p-6 space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto">
              <XCircle className="w-6 h-6 text-red-500" />
            </div>
            <div className="text-center">
              <h3 className="font-black text-gray-900">Batalkan Kontrak?</h3>
              <p className="text-sm text-gray-500 mt-1">{job?.posisi}</p>
            </div>
            {within1hr && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
                <p className="text-xs font-bold text-red-800 text-center">⚠️ Kompensasi Pembatalan</p>
                <p className="text-[11px] text-red-700 text-center leading-relaxed">
                  Pembatalan dalam 1 jam pertama mengharuskan pembayaran kompensasi <span className="font-black">Rp {CANCELLATION_FEE_1HR.toLocaleString("id-ID")}</span> kepada pekerja sesuai ketentuan Rekhastha.
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => handleCancelJobConfirm(cancelConfirmJobId)}
                className="flex-1 bg-red-500 text-white font-bold py-3 rounded-xl text-sm hover:bg-red-600 transition-colors">
                {within1hr ? `Batalkan (Rp ${(CANCELLATION_FEE_1HR).toLocaleString("id-ID")} dipotong)` : "Batalkan Kontrak"}
              </button>
              <button
                onClick={() => setCancelConfirmJobId(null)}
                className="flex-1 bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl text-sm hover:bg-gray-200 transition-colors">
                Kembali
              </button>
            </div>
          </div>
        </div>
      );
    })()}

    <div className="flex-1 overflow-y-auto bg-gray-50">

      {/* ── Stats row ─────────────────────────────────────────── */}
      <div className="p-4 grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 text-center">
          <p className="text-2xl font-black text-blue-600">{customJobs.length}</p>
          <p className="text-[10px] font-medium text-gray-500 mt-0.5">Lowongan</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 text-center">
          <p className="text-2xl font-black text-violet-600">{notifications.length}</p>
          <p className="text-[10px] font-medium text-gray-500 mt-0.5">Pelamar</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 text-center">
          <p className="text-2xl font-black text-emerald-600">
            {customJobs.filter(j => j.escrowStatus === "locked").length}
          </p>
          <p className="text-[10px] font-medium text-gray-500 mt-0.5">Escrow Aktif</p>
        </div>
      </div>

      {/* ── Mode toggle ───────────────────────────────────────── */}
      <div className="px-4 mb-3">
        <div className="flex bg-white border border-gray-200 p-1 rounded-2xl gap-1 shadow-sm">
          <button
            onClick={() => { setHiringMode("cepat"); setBroadcastState("idle"); setFormOpen(true); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition-all ${
              hiringMode === "cepat"
                ? "bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-md ring-2 ring-amber-400/70"
                : "text-gray-500 hover:text-emerald-700"
            }`}>
            <Zap className={`w-3.5 h-3.5 ${hiringMode === "cepat" ? "text-amber-300" : ""}`} />
            ⚡ Broadcast Instan
          </button>
          <button
            onClick={() => { setHiringMode("lama"); setBroadcastState("idle"); setFormOpen(true); }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition-all ${
              hiringMode === "lama"
                ? "bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-md ring-2 ring-amber-400/70"
                : "text-gray-500 hover:text-emerald-700"
            }`}>
            <CalendarDays className={`w-3.5 h-3.5 ${hiringMode === "lama" ? "text-amber-300" : ""}`} />
            📅 Posting Reguler
          </button>
        </div>
        {/* Mode description pill */}
        <div className={`mt-2 rounded-xl px-3 py-2 text-[11px] leading-relaxed font-medium border ${
          hiringMode === "cepat"
            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
            : "bg-emerald-50/60 text-emerald-800 border-emerald-200"
        }`}>
          {hiringMode === "cepat"
            ? `🚨 Untuk kebutuhan mendesak. Sistem broadcast ke semua pekerja aktif dalam radius 5km. Escrow HARUS dikunci terlebih dahulu (biaya sistem ${Math.round(feeRate * 100)}% beban perusahaan).`
            : `📅 Untuk kontrak terencana & terjadwal. Lowongan masuk ke Daftar Lowongan Kerja Terjadwal untuk dilihat pekerja — tanpa alarm broadcast (biaya sistem ${Math.round(feeRate * 100)}% beban perusahaan).`}
        </div>
      </div>

      {/* ── Posting form ─────────────────────────────────────── */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* Form header */}
          <button
            onClick={() => setFormOpen(o => !o)}
            className={`w-full flex items-center justify-between px-4 py-3 border-b border-gray-100 ${
              hiringMode === "cepat" ? "bg-gradient-to-r from-orange-500 to-amber-500" : "bg-gradient-to-r from-blue-600 to-indigo-600"
            }`}>
            <div className="flex items-center gap-2 text-white">
              {hiringMode === "cepat" ? <Radio className="w-4 h-4" /> : <Briefcase className="w-4 h-4" />}
              <span className="text-sm font-bold">
                {hiringMode === "cepat" ? "Broadcast Instan" : "Posting Lowongan Terjadwal"}
              </span>
            </div>
            {formOpen ? <ChevronUp className="w-4 h-4 text-white" /> : <ChevronDown className="w-4 h-4 text-white" />}
          </button>

          {formOpen && (
            <div className="p-4 space-y-3">
              {/* Broadcast success banner */}
              {broadcastState === "done" && (
                <>
                  <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-emerald-800">Broadcast Berhasil! 🎉</p>
                      <p className="text-xs text-emerald-700 mt-0.5">
                        <span className="font-bold">{broadcastCount} pekerja</span> dalam radius 5km menerima notifikasi
                        untuk posisi <span className="font-bold">"{lastBroadcastJob}"</span>.
                      </p>
                      <p className="text-[10px] text-emerald-600 mt-1">Dana escrow terkunci aman · Rekhastha melindungi transaksi Anda</p>
                    </div>
                  </div>
                  <BroadcastRadar />
                </>
              )}

              {/* Broadcasting animation */}
              {broadcastState === "broadcasting" && (
                <>
                  <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3 animate-pulse">
                    <Radio className="w-5 h-5 text-amber-600 shrink-0 animate-spin" />
                    <div>
                      <p className="text-sm font-bold text-amber-800">Sedang Broadcast...</p>
                      <p className="text-xs text-amber-700">Menjangkau pekerja aktif dalam radius 5km</p>
                    </div>
                  </div>
                  <BroadcastRadar />
                </>
              )}

              {/* Locking animation */}
              {broadcastState === "locking" && (
                <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-3 animate-pulse">
                  <Lock className="w-5 h-5 text-blue-600 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-blue-800">Mengunci Escrow...</p>
                    <p className="text-xs text-blue-700">Memverifikasi dana dan mengunci ke rekening Rekhastha</p>
                  </div>
                </div>
              )}

              {broadcastState === "idle" && (
                <>
                  <div>
                    <label className={labelCls}>Nama Posisi / Pekerjaan *</label>
                    <input value={posisi} onChange={e => setPosisi(e.target.value)}
                      placeholder="cth: Barista, Warehouse Helper, Event Crew"
                      className={inputCls} />
                  </div>

                  {/* ── Kategori Pekerjaan ── */}
                  <div>
                    <label className={labelCls}>Kategori Pekerjaan *</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(Object.entries(PLATFORM_FEE_RATES) as [JobCategory, number][]).map(([cat, rate]) => {
                        const categoryLabels: Record<JobCategory, { name: string; desc: string }> = {
                          umum:        { name: "Umum / Manual",       desc: "Pindahan, bersih, packing" },
                          terampil:    { name: "Terampil / Teknis",   desc: "Listrik, sopir, katering" },
                          profesional: { name: "Profesional",         desc: "IT, akuntansi, medis" },
                        };
                        const active = jobCategory === cat;
                        return (
                          <button
                            key={cat} type="button"
                            onClick={() => setJobCategory(cat)}
                            className={`p-2 rounded-xl border text-left transition-all ${
                              active
                                ? "bg-primary text-white border-primary shadow-sm ring-2 ring-primary/30"
                                : "bg-white text-gray-700 border-gray-200 hover:border-primary/40"
                            }`}
                          >
                            <p className={`text-[10px] font-bold leading-tight ${active ? "text-white" : ""}`}>{categoryLabels[cat].name}</p>
                            <p className={`text-[9px] mt-0.5 leading-tight ${active ? "text-white/70" : "text-gray-400"}`}>{categoryLabels[cat].desc}</p>
                            <p className={`text-xs font-black mt-1 ${active ? "text-amber-300" : "text-primary"}`}>{Math.round(rate * 100)}%</p>
                          </button>
                        );
                      })}
                    </div>

                    {/* ── Fee preview card for selected category ── */}
                    {(() => {
                      const categoryLabels: Record<JobCategory, { name: string; desc: string; examples: string }> = {
                        umum:        { name: "Umum / Manual",       desc: "Pindahan, bersih, packing",     examples: "Kuli angkut, petugas kebersihan, packing gudang" },
                        terampil:    { name: "Terampil / Teknis",   desc: "Listrik, sopir, katering",      examples: "Teknisi listrik, sopir, juru masak, barista" },
                        profesional: { name: "Profesional",         desc: "IT, akuntansi, medis",          examples: "Programmer, akuntan, tenaga medis, legal" },
                      };
                      const info = categoryLabels[jobCategory];
                      return (
                        <div className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                          <Banknote className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold text-amber-900 leading-tight">
                              {info.name} — Biaya platform{" "}
                              <span className="text-primary font-black">{Math.round(feeRate * 100)}%</span>
                            </p>
                            <p className="text-[10px] text-amber-700 leading-tight mt-0.5">{info.examples}</p>
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── Kenapa berbeda? ── */}
                    <div className="mt-1.5">
                      <button
                        type="button"
                        onClick={() => setShowFeeExplanation(o => !o)}
                        className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-700 font-semibold underline underline-offset-2"
                      >
                        Kenapa tarif berbeda per kategori?
                        {showFeeExplanation ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                      {showFeeExplanation && (
                        <div className="mt-1.5 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 space-y-1.5">
                          <p className="text-[10px] font-bold text-blue-900">Rekhastha mengenakan biaya berdasarkan kompleksitas pekerjaan:</p>
                          <ul className="space-y-1">
                            <li className="flex items-start gap-1.5 text-[10px] text-blue-800 leading-relaxed">
                              <span className="font-black text-primary shrink-0">3%</span>
                              <span><span className="font-semibold">Umum / Manual</span> — Verifikasi dasar, risiko rendah. Biaya minimal agar aksesibel untuk UMKM dan rumah tangga.</span>
                            </li>
                            <li className="flex items-start gap-1.5 text-[10px] text-blue-800 leading-relaxed">
                              <span className="font-black text-primary shrink-0">5%</span>
                              <span><span className="font-semibold">Terampil / Teknis</span> — Memerlukan verifikasi keahlian & koordinasi lebih. Mencakup perlindungan kontrak lebih kuat.</span>
                            </li>
                            <li className="flex items-start gap-1.5 text-[10px] text-blue-800 leading-relaxed">
                              <span className="font-black text-primary shrink-0">8%</span>
                              <span><span className="font-semibold">Profesional</span> — NDA, verifikasi sertifikat, dan dukungan prioritas. Nilai kontrak umumnya lebih tinggi.</span>
                            </li>
                          </ul>
                          <p className="text-[9px] text-blue-600 leading-relaxed border-t border-blue-200 pt-1.5">
                            🟢 Pekerja selalu menerima 100% upah penuh — biaya platform sepenuhnya beban perusahaan.
                          </p>
                        </div>
                      )}
                    </div>

                    <p className="text-[10px] text-gray-400 mt-1">Biaya platform beban perusahaan · pekerja terima 100% upah</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Tipe Pembayaran</label>
                      <select value={pembayaran} onChange={e => setPembayaran(e.target.value as PaymentType)}
                        className={inputCls}>
                        {(Object.entries(paymentLabels) as [PaymentType, string][]).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Jumlah Pekerja</label>
                      <input type="number" min="1" max="50" value={kuota}
                        onChange={e => setKuota(e.target.value)} className={inputCls} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>
                      {paymentInputLabels[pembayaran]} *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">Rp</span>
                      <input value={nominalRaw} onChange={handleNominalChange}
                        placeholder="cth: 150.000"
                        className={`${inputCls} pl-10`} />
                    </div>
                  </div>
                  {/* ── Broadcast Instan: short urgent note + auto date/location ── */}
                  {hiringMode === "cepat" && (
                    <>
                      <div>
                        <label className={labelCls}>Catatan Singkat / Syarat Mendesak * (Maks 150 Karakter)</label>
                        <textarea value={deskripsi}
                          onChange={e => setDeskripsi(e.target.value.slice(0, 150))}
                          maxLength={150}
                          placeholder="cth: Butuh cepat untuk angkat barang gudang, wajib sepatu tertutup & kaos hitam. Langsung datang!"
                          rows={2} className={`${inputCls} resize-none`} />
                        <p className="text-[10px] text-gray-400 text-right mt-0.5">{deskripsi.length}/150</p>
                      </div>
                      {/* Automated date + GPS location badges */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl px-2.5 py-2">
                          <CalendarDays className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="text-[10px] font-bold text-emerald-800 leading-tight">
                            📅 Tanggal: Hari Ini Otomatis
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-xl px-2.5 py-2">
                          <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="text-[10px] font-bold text-emerald-800 leading-tight">
                            📍 Lokasi: Terkunci Otomatis (Radius Radar 5km)
                          </span>
                        </div>
                      </div>
                    </>
                  )}

                  {/* ── Posting Reguler: schedule + address + full description ── */}
                  {hiringMode === "lama" && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelCls}>Tanggal Mulai Kerja *</label>
                          <input type="date" value={tanggalMulai} min={todayStr}
                            onChange={e => setTanggalMulai(e.target.value)}
                            className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Jam Kerja / Shift *</label>
                          <input value={jamKerja} onChange={e => setJamKerja(e.target.value)}
                            placeholder="cth: 08:00 - 17:00 WIB"
                            className={inputCls} />
                        </div>
                      </div>
                      <LocationPickerSection
                        inputCls={inputCls}
                        labelCls={labelCls}
                        onLocationChange={handleLocationChange}
                      />
                      <div>
                        <label className={labelCls}>Deskripsi Pekerjaan &amp; Kualifikasi Lengkap *</label>
                        <textarea value={deskripsi} onChange={e => setDeskripsi(e.target.value)}
                          placeholder="cth: Detail Tanggung Jawab: 1. Melakukan rekapitulasi data harian... Kualifikasi: Minimal SMA, jujur, teliti..."
                          rows={4} className={`${inputCls} resize-none`} />
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ── Escrow Calculator ──────────────────────────── */}
              {nominalNum > 0 && broadcastState === "idle" && (
                <div className={`rounded-xl border p-3 space-y-2 ${
                  hiringMode === "cepat" ? "bg-orange-50 border-orange-200" : "bg-blue-50 border-blue-200"
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Banknote className={`w-4 h-4 ${hiringMode === "cepat" ? "text-orange-600" : "text-blue-600"}`} />
                    <span className={`text-xs font-bold ${hiringMode === "cepat" ? "text-orange-800" : "text-blue-800"}`}>
                      Kalkulator Escrow Rekhastha
                    </span>
                    <span className={`ml-auto text-[10px] font-black px-2 py-0.5 rounded-full ${
                      hiringMode === "cepat" ? "bg-orange-200 text-orange-800" : "bg-blue-200 text-blue-800"
                    }`}>
                      {Math.round(feeRate * 100)}% {hiringMode === "cepat" ? "TERKUNCI" : "MARK-UP"}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-gray-700">
                      <span>Upah Bersih Pekerja ({kuotaNum} orang)</span>
                      <span className="font-semibold text-emerald-700">{formatRp(upahPokok)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Biaya Platform Rekhastha ({Math.round(feeRate * 100)}% Beban Perusahaan)</span>
                      <span className="font-semibold">{formatRp(biayaSistem)}</span>
                    </div>
                    <div className={`flex justify-between font-bold border-t pt-1.5 text-sm ${
                      hiringMode === "cepat" ? "border-orange-200 text-orange-900" : "border-blue-200 text-blue-900"
                    }`}>
                      <span>Total Dana yang Dititipkan ke Escrow</span>
                      <span>{formatRp(totalEscrow)}</span>
                    </div>
                    <p className="text-[10px] text-emerald-700/80 leading-relaxed pt-0.5">
                      🟢 Pekerja menerima 100% upah utuh — biaya platform {Math.round(feeRate * 100)}% sepenuhnya ditanggung perusahaan.
                    </p>
                  </div>
                  {/* Status badge */}
                  <div className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 mt-1 ${
                    hiringMode === "cepat" ? "bg-orange-100" : "bg-blue-100"
                  }`}>
                    {hiringMode === "cepat"
                      ? <LockOpen className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                      : <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
                    <span className={`text-[10px] font-bold ${
                      hiringMode === "cepat" ? "text-orange-800" : "text-blue-800"
                    }`}>
                      Status: {hiringMode === "cepat"
                        ? "⏳ Menunggu Penguncian Escrow"
                        : "⏳ Deposit Wajib Setelah Seleksi Kandidat"}
                    </span>
                  </div>
                  {/* Tax footnote */}
                  <p className="text-[10px] text-gray-400 italic leading-relaxed border-t border-dashed border-gray-200 pt-1.5 mt-1">
                    *Catatan: Segala kewajiban perpajakan atas transaksi ini menjadi tanggung jawab mandiri masing-masing pihak sesuai hukum yang berlaku.
                  </p>
                </div>
              )}

              {/* Escrow locked badge (after broadcast) */}
              {isEscrowLocked && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                  <Lock className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-emerald-800">Status: Escrow Terkunci 🔒 · Dana Aman di Rekhastha</span>
                </div>
              )}

              {/* Submit button */}
              {broadcastState === "idle" && (
                hiringMode === "cepat" ? (
                  <button
                    onClick={() => { if (formValid) setShowCepatConfirm(true); }}
                    disabled={!formValid}
                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
                      formValid
                        ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md active:scale-[0.98]"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    }`}>
                    <Lock className="w-4 h-4" />
                    {formValid ? `🔒 Kunci Escrow ${formatRp(totalEscrow)} & Broadcast Sekarang` : "Isi Posisi & Upah untuk Lanjut"}
                  </button>
                ) : (
                  <button
                    onClick={handleLamaSubmit}
                    disabled={!formValid}
                    className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all ${
                      formValid
                        ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md active:scale-[0.98]"
                        : "bg-gray-100 text-gray-400 cursor-not-allowed"
                    }`}>
                    <Briefcase className="w-4 h-4" />
                    {formValid ? "📋 Posting Lowongan Terjadwal" : "Isi Posisi & Upah untuk Lanjut"}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Job list (mode-filtered) ───────────────────────────── */}
      <div className="px-4 pb-28 space-y-3">

        {/* Section label */}
        {customJobs.length > 0 && (
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            {hiringMode === "cepat" ? `⚡ Lowongan Broadcast Instan (${cepatJobs.length})` : `📅 Lowongan Posting Reguler (${lamaJobs.length})`}
          </p>
        )}

        {/* Bisa Lama: sort control */}
        {hiringMode === "lama" && lamaJobs.length > 0 && (
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-[10px] text-gray-500 font-semibold">Urutkan pelamar:</span>
            {(["rating", "jarak"] as SortKey[]).map(k => (
              <button key={k} onClick={() => setSortKey(k)}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-full border transition-colors ${
                  sortKey === k ? "bg-blue-600 text-white border-blue-600" : "text-gray-500 border-gray-200 hover:border-blue-300"
                }`}>
                {k === "rating" ? "⭐ Rating" : "📍 Jarak"}
              </button>
            ))}
          </div>
        )}

        {/* Job cards */}
        {(hiringMode === "cepat" ? cepatJobs : himaJobs(lamaJobs, legacyJobs, hiringMode)).map(job => {
          const applicants = sortedApplicants(job.id);
          const pending  = applicants.filter(n => n.status === "ditinjau").length;
          const accepted = applicants.filter(n => n.status === "diterima" || n.status === "selesai").length;
          const isJobLocked = job.escrowStatus === "locked" || lockedJobIds.has(job.id);
          const isCepatJob = job.hiringMode === "cepat";
          const confirmingEscrow = escrowConfirmJobId === job.id;
          const jobExpanded = expandedJobId === job.id;

          return (
            <div key={job.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
              isCepatJob ? "border-orange-100" : "border-blue-100"
            }`}>
              {/* Mode badge strip */}
              <div className={`h-1 ${
                isCepatJob
                  ? "bg-gradient-to-r from-orange-400 to-amber-400"
                  : "bg-gradient-to-r from-blue-500 to-indigo-500"
              }`} />

              <div className="p-4 space-y-3">
                {/* Title row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-bold text-gray-900 text-sm">{job.posisi}</p>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                        isCepatJob
                          ? "bg-orange-50 text-orange-700 border-orange-200"
                          : "bg-blue-50 text-blue-700 border-blue-200"
                      }`}>
                        {isCepatJob ? "⚡ CEPAT" : "📅 TERJADWAL"}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{job.namaPerusahaan || currentUser.name}</p>
                  </div>
                  {/* Escrow status */}
                  {isJobLocked ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">
                      <Lock className="w-2.5 h-2.5" /> Escrow Terkunci 🔒
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
                      ⏳ Menunggu Seleksi
                    </span>
                  )}
                </div>

                {/* Pay row */}
                <div className="flex items-center gap-3 text-[10px] text-gray-500 flex-wrap">
                  <span className="flex items-center gap-1">
                    <Banknote className="w-3 h-3" />
                    {formatRp(job.nominal)} / {paymentUnits[job.pembayaran]}
                  </span>
                  <span>· {job.kuota} orang</span>
                  {isJobLocked && job.escrowAmount ? (
                    <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                      <Lock className="w-3 h-3" /> {formatRp(job.escrowAmount)} di Escrow
                    </span>
                  ) : null}
                  {isCepatJob && job.broadcastActive && (
                    <span className="flex items-center gap-1 text-orange-600 font-semibold animate-pulse">
                      <Radio className="w-3 h-3" /> Broadcast Aktif
                    </span>
                  )}
                </div>

                {/* Applicants row */}
                <button
                  onClick={() => setExpandedJobId(jobExpanded ? null : job.id)}
                  className="w-full flex items-center gap-2 bg-gray-50 hover:bg-gray-100 rounded-xl px-3 py-2 transition-colors">
                  <Users className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <span className="text-xs text-gray-600 flex-1 text-left">
                    {applicants.length > 0 ? `${applicants.length} pelamar` : "Belum ada pelamar"}
                  </span>
                  {pending > 0 && (
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">{pending} menunggu</span>
                  )}
                  {accepted > 0 && (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full">{accepted} diterima</span>
                  )}
                  {applicants.length > 0 && (
                    jobExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  )}
                </button>

                {/* Expanded applicant list (Bisa Lama only) */}
                {jobExpanded && applicants.length > 0 && (
                  <div className="space-y-2 pt-1">
                    {applicants.map(notif => {
                      const rating = getRating(notif.applicantName);
                      const km = getDemoKm(notif.applicantName);
                      return (
                        <div key={notif.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                          notif.status === "diterima" || notif.status === "selesai"
                            ? "bg-emerald-50 border-emerald-200"
                            : "bg-white border-gray-100"
                        }`}>
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white font-black text-xs shrink-0">
                            {notif.applicantName.slice(0, 1)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-900 truncate">{maskName(notif.applicantName)}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="flex items-center gap-0.5 text-[10px] text-amber-600 font-semibold">
                                <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" /> {rating}
                              </span>
                              <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                                <MapPin className="w-2.5 h-2.5" /> {km} km
                              </span>
                              {notif.hasNpwp && (
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                                  <ShieldCheck className="w-2.5 h-2.5" /> Verified Mitra
                                </span>
                              )}
                            </div>
                          </div>
                          {notif.status === "diterima" || notif.status === "selesai" ? (
                            <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1 shrink-0">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Diterima
                            </span>
                          ) : !isCepatJob && !isJobLocked ? (
                            <button
                              onClick={() => setEscrowConfirmJobId(job.id)}
                              className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition-colors shrink-0">
                              Terima & Kunci Escrow
                            </button>
                          ) : (
                            <span className="text-[10px] text-gray-400 shrink-0">Menunggu</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Bisa Lama: escrow confirmation inline */}
                {confirmingEscrow && !isJobLocked && (() => {
                  const confirmFeeRate = job.feeRate ?? DEFAULT_FEE_RATE;
                  const confirmDays    = job.jumlahHari ?? 1;
                  const confirmBase    = job.nominal * confirmDays * job.kuota;
                  const confirmFee     = Math.round(confirmBase * confirmFeeRate);
                  const confirmTotal   = confirmBase + confirmFee;
                  return (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Lock className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                        <span className="text-xs font-bold text-blue-900">Konfirmasi Penguncian Escrow</span>
                        <span className="ml-auto text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-200 text-blue-800">
                          {Math.round(confirmFeeRate * 100)}% MARK-UP
                        </span>
                      </div>
                      <div className="space-y-1.5 text-[11px]">
                        <div className="flex justify-between text-gray-700">
                          <span>Upah Bersih Pekerja ({job.kuota} orang{confirmDays > 1 ? ` × ${confirmDays} hari` : ""})</span>
                          <span className="font-semibold text-emerald-700">{formatRp(confirmBase)}</span>
                        </div>
                        <div className="flex justify-between text-gray-600">
                          <span>Biaya Platform Rekhastha ({Math.round(confirmFeeRate * 100)}% Beban Perusahaan)</span>
                          <span className="font-semibold">{formatRp(confirmFee)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-blue-900 border-t border-blue-200 pt-1.5 text-xs">
                          <span>Total Dana yang Dititipkan ke Escrow</span>
                          <span>{formatRp(confirmTotal)}</span>
                        </div>
                        <p className="text-[10px] text-emerald-700/80 leading-relaxed pt-0.5">
                          🟢 Pekerja menerima 100% upah utuh — biaya platform {Math.round(confirmFeeRate * 100)}% sepenuhnya ditanggung perusahaan.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleConfirmEscrow(job.id)}
                          className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-bold py-2 rounded-xl flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98]">
                          <Lock className="w-3.5 h-3.5" /> Kunci Sekarang
                        </button>
                        <button onClick={() => setEscrowConfirmJobId(null)}
                          className="px-4 bg-gray-100 text-gray-600 text-xs font-bold py-2 rounded-xl hover:bg-gray-200 transition-colors">
                          Batal
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* QR Clock-In display for employer (locked jobs with accepted applicants) */}
                {isJobLocked && job.escrowStatus !== "disputed" && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowQrJobId(showQrJobId === job.id ? null : job.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold py-2 rounded-xl hover:bg-emerald-100 transition-colors">
                        <QrCode className="w-3.5 h-3.5" />
                        {showQrJobId === job.id ? "Tutup QR" : "Tampilkan QR Absensi"}
                      </button>
                      <button onClick={() => onDispute(job.id)}
                        className="flex-1 flex items-center justify-center gap-2 border border-amber-200 bg-amber-50 text-amber-700 text-xs font-semibold py-2 rounded-xl hover:bg-amber-100 transition-colors">
                        <AlertTriangle className="w-3.5 h-3.5" /> Ajukan Sengketa
                      </button>
                    </div>
                    {/* QR display */}
                    {showQrJobId === job.id && (
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col items-center gap-2">
                        <p className="text-[10px] font-bold text-gray-700">QR Dinamis Absensi — Tunjukkan ke Pekerja</p>
                        <EmployerQRDisplay />
                        <p className="text-[9px] text-gray-400 text-center">QR ini unik per shift · Kadaluarsa otomatis setelah shift berakhir</p>
                      </div>
                    )}
                    {/* Cancellation button */}
                    <button
                      onClick={() => setCancelConfirmJobId(job.id)}
                      className="w-full flex items-center justify-center gap-1.5 border border-red-200 bg-red-50 text-red-600 text-xs font-semibold py-2 rounded-xl hover:bg-red-100 transition-colors">
                      <XCircle className="w-3.5 h-3.5" />
                      Batalkan Kontrak {lockedAtMap[job.id] ? "(Kompensasi Berlaku)" : "(Rp20rb jika &lt;1 Jam)"}
                    </button>
                  </div>
                )}
                {job.escrowStatus === "disputed" && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <p className="text-[10px] text-red-600 flex-1">Dana dibekukan · Menunggu resolusi admin Rekhastha</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Legacy jobs (no hiring mode) */}
        {hiringMode === "lama" && legacyJobs.length > 0 && (
          <>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mt-4">📁 Lowongan Lama</p>
            {legacyJobs.map(job => {
              const applicants = notifications.filter(n => n.jobId === job.id);
              const pending = applicants.filter(n => n.status === "ditinjau").length;
              const accepted = applicants.filter(n => n.status === "diterima" || n.status === "selesai").length;
              return (
                <div key={job.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-gray-900 text-sm">{job.posisi}</p>
                      <p className="text-[10px] text-gray-400">{job.namaPerusahaan || currentUser.name}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      job.escrowStatus === "locked" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                      job.escrowStatus === "disputed" ? "bg-red-50 text-red-700 border-red-200" :
                      "bg-gray-50 text-gray-500 border-gray-200"
                    }`}>
                      {job.escrowStatus === "locked" ? "🔒 Dikunci" : job.escrowStatus === "disputed" ? "⚠️ Sengketa" : "⏳ Pending"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 text-xs">
                    <Users className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-gray-600 flex-1">{applicants.length > 0 ? `${applicants.length} pelamar` : "Belum ada pelamar"}</span>
                    {pending > 0 && <span className="text-[10px] font-bold text-amber-600">{pending} menunggu</span>}
                    {accepted > 0 && <span className="text-[10px] font-bold text-emerald-600">{accepted} diterima</span>}
                  </div>
                  {job.escrowStatus === "locked" && (
                    <button onClick={() => onDispute(job.id)}
                      className="w-full border border-amber-200 bg-amber-50 text-amber-700 text-xs font-semibold py-2 rounded-xl hover:bg-amber-100 transition-colors">
                      Ajukan Sengketa
                    </button>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* Empty state */}
        {customJobs.length === 0 && (
          <div className="flex flex-col items-center gap-4 py-10 px-6 text-center">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
              hiringMode === "cepat" ? "bg-orange-100" : "bg-blue-100"
            }`}>
              {hiringMode === "cepat" ? <Zap className="w-7 h-7 text-orange-500" /> : <CalendarDays className="w-7 h-7 text-blue-600" />}
            </div>
            <div>
              <p className="font-bold text-gray-900">Belum Ada Lowongan</p>
              <p className="text-sm text-gray-500 mt-1 leading-relaxed">
                {hiringMode === "cepat"
                  ? "Isi form di atas lalu kunci escrow untuk broadcast instan ke pekerja terdekat."
                  : "Posting lowongan terjadwal dan pilih kandidat terbaik dari daftar pelamar."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

function himaJobs(lamaJobs: CustomJob[], _legacyJobs: CustomJob[], mode: HiringMode): CustomJob[] {
  return mode === "lama" ? lamaJobs : [];
}
