import { useState, useEffect, useRef } from "react";
import { X, MapPin, QrCode, CheckCircle, AlertTriangle, Clock, ShieldCheck, Zap, RefreshCw } from "lucide-react";
import { CustomJob } from "@/types/custom-job";
import QrScanner from "./qr-scanner";
import { submitAttendanceScan } from "@/lib/attendance-client";

interface ClockInModalProps {
  job: CustomJob;
  userLat: number;
  userLng: number;
  locationAccuracy: number | null;
  isClockedIn: boolean;
  clockedInAt: Date | null;
  workerName: string;
  onClockIn: () => void;
  onClockOut: () => void;
  onClose: () => void;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function elapsed(from: Date): string {
  const secs = Math.floor((Date.now() - from.getTime()) / 1000);
  const h = Math.floor(secs / 3600).toString().padStart(2, "0");
  const m = Math.floor((secs % 3600) / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

type Phase = "idle" | "scanning" | "verifying" | "verified" | "error";

export default function ClockInModal({
  job, userLat, userLng, locationAccuracy, isClockedIn, clockedInAt,
  workerName, onClockIn, onClockOut, onClose,
}: ClockInModalProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verifiedKind, setVerifiedKind] = useState<"masuk" | "pulang">("masuk");
  const [timer, setTimer] = useState("00:00:00");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneRef = useRef(false);

  const distance = haversineMeters(userLat, userLng, job.lat, job.lng);
  const withinRange = distance < 500;

  useEffect(() => {
    if (isClockedIn && clockedInAt) {
      intervalRef.current = setInterval(() => setTimer(elapsed(clockedInAt)), 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isClockedIn, clockedInAt]);

  const handleScan = async (text: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setPhase("verifying");
    setErrorMsg(null);
    try {
      const row = await submitAttendanceScan(text, workerName);
      setVerifiedKind(row.kind);
      setPhase("verified");
      setTimeout(() => {
        if (row.kind === "masuk") onClockIn();
        else onClockOut();
        onClose();
      }, 1600);
    } catch (e) {
      doneRef.current = false;
      setErrorMsg(e instanceof Error ? e.message : "QR tidak valid.");
      setPhase("error");
    }
  };

  const startScan = () => {
    doneRef.current = false;
    setErrorMsg(null);
    setPhase("scanning");
  };

  const scanLabel = isClockedIn ? "Scan QR Presensi Pulang" : "Scan QR Presensi Masuk";

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col justify-end"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)" }}
    >
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="relative bg-white rounded-t-3xl w-full max-h-[88vh] overflow-y-auto"
        style={{ animation: "slideUp 0.28s cubic-bezier(0.32,0.72,0,1)" }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900 text-base">
              {isClockedIn ? "Shift Aktif — Presensi Pulang" : "Presensi Masuk via QR"}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{job.posisi} · Verifikasi Anti-Joki</p>
          </div>
          <button onClick={onClose} data-testid="button-close-clockin" className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100">
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Distance indicator */}
          <div className={`flex items-start gap-3 p-4 rounded-xl border ${withinRange ? "bg-primary/5 border-primary/15" : "bg-amber-50 border-amber-200"}`}>
            <MapPin className={`w-5 h-5 shrink-0 mt-0.5 ${withinRange ? "text-primary" : "text-amber-500"}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${withinRange ? "text-primary" : "text-amber-700"}`}>
                {withinRange ? "✅ Dalam Radius Lokasi Kerja" : "⚠️ Di Luar Radius 500m"}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Jarak: <span className="font-bold">{distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(2)} km`}</span> dari titik kerja
              </p>
              {locationAccuracy != null && (
                <p className={`text-[10px] mt-1 font-medium ${locationAccuracy <= 20 ? "text-emerald-600" : locationAccuracy <= 100 ? "text-amber-600" : "text-red-500"}`}>
                  {locationAccuracy <= 20 ? "📡 GPS Presisi Tinggi" : locationAccuracy <= 100 ? "📡 GPS Cukup Akurat" : "📡 GPS Kurang Akurat"} · Akurasi ±{locationAccuracy} m
                </p>
              )}
            </div>
          </div>

          {/* Active timer (clocked in) */}
          {isClockedIn && clockedInAt && (
            <>
              <div className="bg-primary text-white rounded-2xl p-5 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Clock className="w-4 h-4 opacity-80" />
                  <span className="text-xs font-semibold opacity-80">Durasi Kerja — SHIFT AKTIF</span>
                </div>
                <div className="text-4xl font-mono font-bold tracking-widest">{timer}</div>
                <p className="text-xs opacity-70 mt-2">
                  Mulai: {clockedInAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs font-black text-emerald-800">🛡️ Perlindungan BPJS Aktif</p>
                  <p className="text-[10px] text-emerald-700 mt-0.5">BPJS Ketenagakerjaan & asuransi kecelakaan kerja aktif selama shift berlangsung.</p>
                </div>
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              </div>
            </>
          )}

          {/* Idle: instructions + scan button */}
          {phase === "idle" && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-blue-600" />
                  <p className="text-sm font-bold text-blue-900">Cara Presensi Anti-Joki</p>
                </div>
                <ol className="space-y-2 text-xs text-blue-800">
                  <li className="flex items-start gap-2"><span className="font-black bg-blue-200 text-blue-800 w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5">1</span>Minta Pemberi Kerja menampilkan QR Presensi {isClockedIn ? "Pulang" : "Masuk"} di lokasi.</li>
                  <li className="flex items-start gap-2"><span className="font-black bg-blue-200 text-blue-800 w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5">2</span>Tekan "Scan QR" dan arahkan kamera ke QR Code milik Pemberi Kerja.</li>
                  <li className="flex items-start gap-2"><span className="font-black bg-blue-200 text-blue-800 w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5">3</span>{isClockedIn ? "Shift selesai, escrow otomatis diproses." : "QR terverifikasi → shift & BPJS langsung aktif."}</li>
                </ol>
              </div>
              <button
                onClick={startScan}
                data-testid="button-start-scan"
                className={`w-full font-bold py-4 rounded-xl text-base flex items-center justify-center gap-2 active:scale-[0.98] transition-all text-white ${isClockedIn ? "bg-red-500 hover:bg-red-600" : "bg-primary hover:bg-primary/90"}`}
                style={{ boxShadow: isClockedIn ? "0 4px 16px rgba(239,68,68,0.35)" : "0 4px 16px rgba(6,95,70,0.35)" }}>
                <QrCode className="w-5 h-5" />
                {scanLabel}
              </button>
            </div>
          )}

          {/* Scanning: live camera */}
          {phase === "scanning" && (
            <div className="space-y-3">
              <QrScanner onScan={handleScan} />
              <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
                <Zap className="w-3.5 h-3.5 text-orange-500" />
                <span>Arahkan kamera ke QR Presensi Pemberi Kerja...</span>
              </div>
              <button
                onClick={() => setPhase("idle")}
                className="w-full border border-gray-200 text-gray-600 font-semibold py-2.5 rounded-xl text-sm">
                Batal
              </button>
            </div>
          )}

          {/* Verifying */}
          {phase === "verifying" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <RefreshCw className="w-8 h-8 text-primary animate-spin" />
              <p className="text-sm font-semibold text-gray-700">Memverifikasi QR Presensi...</p>
            </div>
          )}

          {/* Verified */}
          {phase === "verified" && (
            <div className="space-y-4">
              <div className="bg-primary/10 border border-primary/20 rounded-2xl p-6 flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center animate-bounce">
                  <CheckCircle className="w-10 h-10 text-emerald-600" />
                </div>
                <p className="font-black text-emerald-800 text-lg">
                  {verifiedKind === "masuk" ? "Presensi Masuk Berhasil! ✅" : "Presensi Pulang Berhasil! 🏁"}
                </p>
                <p className="text-xs text-gray-600 text-center">
                  {verifiedKind === "masuk"
                    ? "Clock-in tercatat. Shift aktif & tersinkron ke Pemberi Kerja..."
                    : "Clock-out tercatat. Escrow sedang diproses untuk pencairan..."}
                </p>
              </div>
            </div>
          )}

          {/* Error */}
          {phase === "error" && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-red-500" />
                </div>
                <p className="font-black text-red-700 text-base">Presensi Gagal</p>
                <p className="text-xs text-gray-600 text-center">{errorMsg}</p>
              </div>
              <button
                onClick={startScan}
                data-testid="button-retry-scan"
                className="w-full bg-primary text-white font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-all">
                <QrCode className="w-4 h-4" /> Coba Scan Lagi
              </button>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes slideUp { from{transform:translateY(100%);opacity:0.6} to{transform:translateY(0);opacity:1} }`}</style>
    </div>
  );
}
