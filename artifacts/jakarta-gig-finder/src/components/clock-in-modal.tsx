import { useState, useEffect, useRef } from "react";
import { X, MapPin, Camera, CheckCircle, AlertTriangle, Clock } from "lucide-react";
import { CustomJob } from "@/types/custom-job";

interface ClockInModalProps {
  job: CustomJob;
  userLat: number;
  userLng: number;
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

type SelfieStep = "idle" | "camera" | "captured";

export default function ClockInModal({
  job, userLat, userLng, isClockedIn, clockedInAt, onClockIn, onClockOut, onClose,
}: ClockInModalProps) {
  const [selfieStep, setSelfieStep] = useState<SelfieStep>("idle");
  const [timer, setTimer] = useState("00:00:00");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const distance = haversineMeters(userLat, userLng, job.lat, job.lng);
  // For demo: treat as < 50m in simulation (actual GPS may differ), clamp to show distance
  // We show real distance but allow clock-in with a demo bypass button
  const withinRange = distance < 50000; // relaxed for demo (real GPS varies)

  useEffect(() => {
    if (isClockedIn && clockedInAt) {
      intervalRef.current = setInterval(() => setTimer(elapsed(clockedInAt)), 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isClockedIn, clockedInAt]);

  const handleStartCamera = () => {
    if (!withinRange) return;
    setSelfieStep("camera");
  };

  const handleCapture = () => {
    setSelfieStep("captured");
    setTimeout(() => {
      onClockIn();
      onClose();
    }, 1200);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col justify-end"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)" }}
    >
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="relative bg-white rounded-t-3xl w-full max-h-[80vh] overflow-y-auto"
        style={{ animation: "slideUp 0.28s cubic-bezier(0.32,0.72,0,1)" }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900 text-base">
              {isClockedIn ? "Sedang Bekerja" : "Clock-In Absensi"}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">{job.posisi}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100">
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          {/* Distance indicator */}
          <div className={`flex items-center gap-3 p-4 rounded-xl border ${withinRange ? "bg-primary/5 border-primary/15" : "bg-amber-50 border-amber-200"}`}>
            <MapPin className={`w-5 h-5 shrink-0 ${withinRange ? "text-primary" : "text-amber-500"}`} />
            <div>
              <p className={`text-sm font-semibold ${withinRange ? "text-primary" : "text-amber-700"}`}>
                {withinRange ? "Dalam Jangkauan Lokasi Kerja" : "Jauh dari Lokasi Kerja"}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Jarak: {distance < 1000 ? `${Math.round(distance)} m` : `${(distance / 1000).toFixed(1)} km`} dari titik kerja
                {!withinRange && " · Harap mendekat ke lokasi"}
              </p>
            </div>
          </div>

          {/* Active timer */}
          {isClockedIn && clockedInAt && (
            <div className="bg-primary text-white rounded-2xl p-5 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <Clock className="w-4 h-4 opacity-80" />
                <span className="text-xs font-semibold opacity-80">Durasi Kerja</span>
              </div>
              <div className="text-4xl font-mono font-bold tracking-widest">{timer}</div>
              <p className="text-xs opacity-70 mt-2">
                Mulai: {clockedInAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          )}

          {/* Selfie camera simulation */}
          {selfieStep === "camera" && (
            <div className="bg-gray-900 rounded-2xl overflow-hidden aspect-video flex flex-col items-center justify-center gap-4 relative">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-32 rounded-full border-4 border-white/40 border-dashed flex items-center justify-center">
                  <Camera className="w-12 h-12 text-white/60" />
                </div>
              </div>
              <div className="absolute bottom-4 flex gap-4">
                <button
                  onClick={handleCapture}
                  className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg active:scale-95 transition-transform"
                >
                  <div className="w-13 h-13 rounded-full border-4 border-gray-300 w-12 h-12" />
                </button>
              </div>
              <p className="absolute top-4 text-white/80 text-xs font-medium bg-black/30 px-3 py-1 rounded-full">
                Foto selfie untuk verifikasi absensi
              </p>
            </div>
          )}

          {selfieStep === "captured" && (
            <div className="bg-primary/10 border border-primary/20 rounded-2xl p-6 flex flex-col items-center gap-2">
              <CheckCircle className="w-10 h-10 text-primary" />
              <p className="font-bold text-primary text-sm">Foto Absensi Terverifikasi!</p>
              <p className="text-xs text-gray-500">Clock-in berhasil dicatat...</p>
            </div>
          )}

          {!isClockedIn && selfieStep === "idle" && (
            <>
              {withinRange ? (
                <button
                  data-testid="button-clock-in"
                  onClick={handleStartCamera}
                  className="w-full bg-primary text-white font-bold py-4 rounded-xl text-base flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-[0.98] transition-all"
                  style={{ boxShadow: "0 4px 16px rgba(6,95,70,0.35)" }}
                >
                  <Camera className="w-5 h-5" />
                  Mulai Kerja (Clock-In)
                </button>
              ) : (
                <>
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 leading-relaxed">
                      Anda harus berada dalam radius 50 meter dari lokasi kerja untuk dapat Clock-In. Gunakan mode simulasi di bawah untuk demo.
                    </p>
                  </div>
                  <button
                    data-testid="button-clock-in-sim"
                    onClick={handleStartCamera}
                    className="w-full bg-amber-500 text-white font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-amber-600 transition-all"
                  >
                    <Camera className="w-4 h-4" />
                    Simulasi Clock-In (Demo)
                  </button>
                </>
              )}
            </>
          )}

          {isClockedIn && (
            <button
              data-testid="button-clock-out"
              onClick={() => { onClockOut(); onClose(); }}
              className="w-full bg-red-500 text-white font-bold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-red-600 active:scale-[0.98] transition-all"
            >
              Selesai Kerja (Clock-Out)
            </button>
          )}
        </div>
      </div>
      <style>{`@keyframes slideUp { from{transform:translateY(100%);opacity:0.6} to{transform:translateY(0);opacity:1} }`}</style>
    </div>
  );
}
