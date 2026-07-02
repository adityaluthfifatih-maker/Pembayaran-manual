import { useState, useEffect, useRef } from "react";
import { MapPin, Banknote, Building2, X, Zap, CheckCircle2 } from "lucide-react";
import { CustomJob, paymentUnits } from "@/types/custom-job";

interface JobPingModalProps {
  job: CustomJob;
  userLat: number;
  userLng: number;
  onAccept: (job: CustomJob) => void;
  onDecline: () => void;
}

const COUNTDOWN = 15;

function distKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return (R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1);
}

export default function JobPingModal({ job, userLat, userLng, onAccept, onDecline }: JobPingModalProps) {
  const [countdown, setCountdown] = useState(COUNTDOWN);
  const [accepting, setAccepting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const km = distKm(userLat, userLng, job.lat, job.lng);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(timerRef.current!);
          setTimeout(onDecline, 200);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current!); };
  }, [onDecline]);

  const handleAccept = () => {
    if (timerRef.current) clearInterval(timerRef.current!);
    setAccepting(true);
    setTimeout(() => onAccept(job), 900);
  };

  // SVG countdown ring
  const r = 26;
  const circ = 2 * Math.PI * r;
  const dash = circ * (1 - countdown / COUNTDOWN);
  const isUrgent = countdown <= 5;

  return (
    <div className="fixed inset-0 z-[200] bg-black/88 flex items-center justify-center px-4">

      {/* ── Radar rings ───────────────────────────────────── */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {[1, 2, 3, 4].map(i => (
          <div
            key={i}
            className="absolute rounded-full border-2 border-emerald-400/35"
            style={{
              width: `${i * 100}px`,
              height: `${i * 100}px`,
              animation: "radar-expand 2.2s ease-out infinite",
              animationDelay: `${(i - 1) * 0.55}s`,
            }}
          />
        ))}
        {/* Glow orb */}
        <div
          className="absolute w-16 h-16 rounded-full bg-emerald-400/15"
          style={{ animation: "glow-pulse 1.5s ease-in-out infinite" }}
        />
      </div>

      {/* ── Main card ─────────────────────────────────────── */}
      <div
        className="relative w-full max-w-sm bg-gray-950 rounded-3xl shadow-2xl border border-gray-800 overflow-hidden"
        style={{ animation: accepting ? undefined : "ping-shake 0.5s ease-out" }}
      >
        {/* Color strip */}
        <div className="h-1.5 bg-gradient-to-r from-emerald-400 via-green-400 to-teal-400" />

        <div className="p-5 space-y-4">

          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "linear-gradient(135deg,#f97316,#f59e0b)", animation: "glow-pulse 1.5s ease-in-out infinite" }}>
                <Zap className="w-4.5 h-4.5 text-white w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] font-black text-orange-400 uppercase tracking-widest">⚡ Lowongan Cepat!</p>
                <p className="text-[9px] text-gray-600">Rekhastha Broadcast · {km} km dari Anda</p>
              </div>
            </div>

            {/* Countdown ring */}
            <div className="relative w-14 h-14 shrink-0">
              <svg className="w-14 h-14 -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r={r} fill="none" stroke="#1f2937" strokeWidth="4" />
                <circle
                  cx="32" cy="32" r={r}
                  fill="none"
                  stroke={isUrgent ? "#ef4444" : "#10b981"}
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={dash}
                  style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-xl font-black ${isUrgent ? "text-red-400" : "text-white"}`}>
                  {countdown}
                </span>
              </div>
            </div>
          </div>

          {/* Job title */}
          <div className="text-center py-1">
            <h2 className="text-3xl font-black text-white tracking-tight">{job.posisi}</h2>
            <p className="text-sm text-gray-400 mt-1 flex items-center justify-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              {job.namaPerusahaan || "Perusahaan"}
            </p>
          </div>

          {/* Info cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-3 text-center">
              <Banknote className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
              <p className="text-[11px] font-black text-white leading-none">
                Rp {job.nominal.toLocaleString("id-ID")}
              </p>
              <p className="text-[9px] text-gray-600 mt-0.5">
                /{paymentUnits[job.pembayaran].toLowerCase()}
              </p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-3 text-center">
              <MapPin className="w-4 h-4 text-blue-400 mx-auto mb-1" />
              <p className="text-[11px] font-black text-white leading-none">{km} km</p>
              <p className="text-[9px] text-gray-600 mt-0.5">dari sini</p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-3 text-center">
              <span className="block text-base mb-0.5">🔒</span>
              <p className="text-[11px] font-black text-white leading-none">Aman</p>
              <p className="text-[9px] text-gray-600 mt-0.5">Escrow</p>
            </div>
          </div>

          {/* Escrow banner */}
          {job.escrowAmount ? (
            <div className="flex items-center justify-between bg-emerald-950/70 border border-emerald-800/50 rounded-2xl px-4 py-2.5">
              <span className="text-xs text-emerald-400 font-semibold">Dana Escrow Terkunci</span>
              <span className="text-sm font-black text-emerald-300">
                Rp {Math.round(job.escrowAmount).toLocaleString("id-ID")}
              </span>
            </div>
          ) : null}

          {/* Dresscode */}
          {job.dresscode && (
            <p className="text-center text-[10px] text-gray-600">
              👔 Dresscode: <span className="text-gray-400 font-semibold">{job.dresscode}</span>
            </p>
          )}

          {/* CTA */}
          {accepting ? (
            <div className="flex items-center justify-center gap-3 py-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 animate-bounce" />
              <span className="text-base font-black text-emerald-400">Lamaran Terkirim!</span>
            </div>
          ) : (
            <div className="flex gap-3 pt-1">
              <button
                onClick={onDecline}
                className="w-12 h-12 rounded-2xl bg-gray-900 border border-gray-700 text-gray-400 flex items-center justify-center hover:bg-gray-800 active:scale-95 transition-all shrink-0">
                <X className="w-5 h-5" />
              </button>
              <button
                onClick={handleAccept}
                className="flex-1 h-12 rounded-2xl font-black text-base text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                style={{
                  background: "linear-gradient(135deg,#059669,#10b981)",
                  boxShadow: "0 6px 24px rgba(16,185,129,0.35)",
                }}>
                ✓ TERIMA PEKERJAAN
              </button>
            </div>
          )}

          <p className="text-center text-[10px] text-gray-700">
            Otomatis dilewati dalam <span className={isUrgent ? "text-red-500 font-bold" : ""}>{countdown}s</span>
          </p>
        </div>
      </div>
    </div>
  );
}
