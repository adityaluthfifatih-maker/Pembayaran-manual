import { useState, useEffect, useRef } from "react";
import { X, MapPin, QrCode, CheckCircle, AlertTriangle, Clock, ShieldCheck, Zap, Camera, Scan } from "lucide-react";
import { CustomJob } from "@/types/custom-job";

interface ClockInModalProps {
  job: CustomJob;
  userLat: number;
  userLng: number;
  locationAccuracy: number | null;
  isClockedIn: boolean;
  clockedInAt: Date | null;
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

// Simulated 21×21 QR code matrix (static pattern for demo)
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

function QRDisplay() {
  return (
    <div className="bg-white p-2.5 rounded-2xl border-4 border-gray-900 inline-block shadow-lg">
      {QR_MATRIX.map((row, r) => (
        <div key={r} className="flex">
          {row.map((cell, c) => (
            <div key={c} style={{ width: 9, height: 9, backgroundColor: cell ? "#111827" : "#ffffff" }} />
          ))}
        </div>
      ))}
    </div>
  );
}

type QrStep = "idle" | "scanning" | "verified";
type ProofStep = "idle" | "capturing" | "captured";

export default function ClockInModal({
  job, userLat, userLng, locationAccuracy, isClockedIn, clockedInAt,
  onClockIn, onClockOut, onClose,
}: ClockInModalProps) {
  const [qrStep, setQrStep] = useState<QrStep>("idle");
  const [timer, setTimer] = useState("00:00:00");
  const [scanProgress, setScanProgress] = useState(0);
  const [proofStep, setProofStep] = useState<ProofStep>("idle");
  const [captureProgress, setCaptureProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const captureRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const distance = haversineMeters(userLat, userLng, job.lat, job.lng);
  const withinRange = distance < 500;

  useEffect(() => {
    if (isClockedIn && clockedInAt) {
      intervalRef.current = setInterval(() => setTimer(elapsed(clockedInAt)), 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isClockedIn, clockedInAt]);

  useEffect(() => {
    return () => { if (captureRef.current) clearInterval(captureRef.current); };
  }, []);

  const handleStartCapture = () => {
    setProofStep("capturing");
    setCaptureProgress(0);
    let p = 0;
    captureRef.current = setInterval(() => {
      p += 5;
      setCaptureProgress(p);
      if (p >= 100) {
        clearInterval(captureRef.current!);
        setProofStep("captured");
      }
    }, 70);
  };

  const handleStartScan = () => {
    setQrStep("scanning");
    setScanProgress(0);
    let p = 0;
    scanRef.current = setInterval(() => {
      p += 4;
      setScanProgress(p);
      if (p >= 100) {
        clearInterval(scanRef.current!);
        setQrStep("verified");
        setTimeout(() => {
          onClockIn();
          onClose();
        }, 1800);
      }
    }, 80);
  };

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
              {isClockedIn ? "Shift Aktif" : "Clock-In via QR Rekhastha"}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{job.posisi} · Verifikasi Anti-Joki</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100">
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

          {/* Active timer */}
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
              {/* BPJS active banner */}
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

          {/* QR Scan flow */}
          {!isClockedIn && (
            <>
              {qrStep === "idle" && (
                <div className="space-y-4">
                  {/* Instructions */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <QrCode className="w-5 h-5 text-blue-600" />
                      <p className="text-sm font-bold text-blue-900">Cara Clock-In Anti-Joki</p>
                    </div>
                    <ol className="space-y-2 text-xs text-blue-800">
                      <li className="flex items-start gap-2"><span className="font-black bg-blue-200 text-blue-800 w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5">1</span>Minta QR Code dinamis dari perangkat Pemberi Kerja di lokasi.</li>
                      <li className="flex items-start gap-2"><span className="font-black bg-blue-200 text-blue-800 w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5">2</span>Tekan tombol "Scan QR" di bawah dan arahkan kamera ke QR Code.</li>
                      <li className="flex items-start gap-2"><span className="font-black bg-blue-200 text-blue-800 w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5">3</span>QR berhasil terdeteksi → Shift aktif & BPJS langsung berlaku.</li>
                    </ol>
                  </div>

                  {/* Employer QR preview */}
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col items-center gap-3">
                    <p className="text-xs font-semibold text-gray-600">QR Code Dinamis Pemberi Kerja:</p>
                    <QRDisplay />
                    <div className="flex items-center gap-2 text-[10px] text-gray-500">
                      <Zap className="w-3 h-3 text-orange-500" />
                      <span>QR ini unik per shift dan kadaluarsa otomatis</span>
                    </div>
                  </div>

                  {withinRange ? (
                    <button
                      onClick={handleStartScan}
                      className="w-full bg-primary text-white font-bold py-4 rounded-xl text-base flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-[0.98] transition-all"
                      style={{ boxShadow: "0 4px 16px rgba(6,95,70,0.35)" }}>
                      <QrCode className="w-5 h-5" />
                      Scan QR Pemberi Kerja
                    </button>
                  ) : (
                    <>
                      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700 leading-relaxed">
                          Anda harus berada dalam radius 500 meter dari lokasi kerja untuk Clock-In. Gunakan simulasi di bawah untuk demo.
                        </p>
                      </div>
                      <button
                        onClick={handleStartScan}
                        className="w-full bg-amber-500 text-white font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-amber-600 transition-all">
                        <QrCode className="w-4 h-4" />
                        Simulasi Scan QR (Demo)
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Scanning step */}
              {qrStep === "scanning" && (
                <div className="space-y-4">
                  <div className="bg-gray-900 rounded-2xl overflow-hidden aspect-video flex flex-col items-center justify-center relative">
                    {/* Camera frame */}
                    <div className="relative">
                      {/* Corner brackets */}
                      <div className="absolute -top-2 -left-2 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                      <div className="absolute -top-2 -right-2 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                      <div className="absolute -bottom-2 -left-2 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                      <div className="absolute -bottom-2 -right-2 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />
                      <QRDisplay />
                    </div>
                    {/* Scan line animation */}
                    <div
                      className="absolute left-8 right-8 h-0.5 bg-emerald-400 opacity-80 blur-[1px]"
                      style={{
                        top: `${20 + scanProgress * 0.6}%`,
                        transition: "top 0.08s linear",
                        boxShadow: "0 0 8px rgba(52,211,153,0.8)",
                      }}
                    />
                    <p className="absolute bottom-4 text-white/90 text-xs font-semibold bg-black/50 px-3 py-1 rounded-full">
                      Mendeteksi QR... {scanProgress}%
                    </p>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-green-500 rounded-full transition-all"
                      style={{ width: `${scanProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Verified step */}
              {qrStep === "verified" && (
                <div className="space-y-4">
                  <div className="bg-primary/10 border border-primary/20 rounded-2xl p-6 flex flex-col items-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center animate-bounce">
                      <CheckCircle className="w-10 h-10 text-emerald-600" />
                    </div>
                    <p className="font-black text-emerald-800 text-lg">QR Terverifikasi! ✅</p>
                    <p className="text-xs text-gray-600 text-center">Clock-in berhasil dicatat. Shift aktif dimulai...</p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <p className="text-xs font-black text-emerald-800">🛡️ BPJS Perlindungan Aktif!</p>
                      <p className="text-[10px] text-emerald-700 mt-0.5">Asuransi kecelakaan kerja kini aktif untuk shift ini.</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {isClockedIn && (
            <div className="space-y-4">
              {/* Photo proof requirement */}
              {proofStep === "idle" && (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Camera className="w-5 h-5 text-blue-600" />
                      <p className="text-sm font-bold text-blue-900">Bukti Foto Live Wajib</p>
                    </div>
                    <p className="text-xs text-blue-800 leading-relaxed">
                      Sebelum Clock-Out, ambil foto bukti kehadiran langsung via kamera (live) sebagai verifikasi anti-joki. Clock-Out tidak dapat dilakukan tanpa foto bukti.
                    </p>
                  </div>
                  <button
                    onClick={handleStartCapture}
                    className="w-full bg-primary text-white font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-[0.98] transition-all"
                    style={{ boxShadow: "0 4px 16px rgba(6,95,70,0.35)" }}>
                    <Camera className="w-5 h-5" />
                    Ambil Foto Bukti Live
                  </button>
                </>
              )}

              {/* Capturing step */}
              {proofStep === "capturing" && (
                <div className="space-y-4">
                  <div className="bg-gray-900 rounded-2xl overflow-hidden aspect-video flex flex-col items-center justify-center relative">
                    {/* Face outline guide */}
                    <div className="relative">
                      <div className="absolute -top-2 -left-2 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                      <div className="absolute -top-2 -right-2 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                      <div className="absolute -bottom-2 -left-2 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                      <div className="absolute -bottom-2 -right-2 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />
                      <div className="w-28 h-36 rounded-[45%] border-2 border-dashed border-emerald-400/70 flex items-center justify-center">
                        <Scan className="w-10 h-10 text-emerald-400/80 animate-pulse" />
                      </div>
                    </div>
                    <p className="absolute bottom-4 text-white/90 text-xs font-semibold bg-black/50 px-3 py-1 rounded-full">
                      Memindai wajah... {captureProgress}%
                    </p>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-green-500 rounded-full transition-all"
                      style={{ width: `${captureProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Captured step */}
              {proofStep === "captured" && (
                <>
                  <div className="bg-primary/10 border border-primary/20 rounded-2xl p-5 flex flex-col items-center gap-2">
                    <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                      <CheckCircle className="w-9 h-9 text-emerald-600" />
                    </div>
                    <p className="font-black text-emerald-800 text-base">Foto Bukti Terverifikasi! ✅</p>
                    <p className="text-xs text-gray-600 text-center">Bukti kehadiran live berhasil direkam. Anda kini dapat menyelesaikan shift.</p>
                  </div>
                  <button
                    onClick={() => { onClockOut(); onClose(); }}
                    className="w-full bg-red-500 text-white font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-red-600 active:scale-[0.98] transition-all">
                    Selesai Kerja (Clock-Out)
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes slideUp { from{transform:translateY(100%);opacity:0.6} to{transform:translateY(0);opacity:1} }`}</style>
    </div>
  );
}
