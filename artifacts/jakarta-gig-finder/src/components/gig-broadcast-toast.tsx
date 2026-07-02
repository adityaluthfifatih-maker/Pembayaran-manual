import { useEffect, useState } from "react";
import { Radio, MapPin, X, Banknote } from "lucide-react";
import type { CustomJob } from "@/types/custom-job";
import { calcTotal } from "@/types/custom-job";

interface GigBroadcastToastProps {
  gig: CustomJob;
  onView: () => void;
  onDismiss: () => void;
}

const AUTO_SEC = 9;

/** Short two-tone "new job" chime via WebAudio (no asset needed). */
function playChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.14;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    });
    setTimeout(() => ctx.close().catch(() => {}), 700);
  } catch {
    /* audio is best-effort */
  }
}

export default function GigBroadcastToast({
  gig,
  onView,
  onDismiss,
}: GigBroadcastToastProps) {
  const [secs, setSecs] = useState(AUTO_SEC);

  useEffect(() => {
    playChime();
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setSecs((s) => {
        if (s <= 1) {
          clearInterval(t);
          onDismiss();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [onDismiss]);

  const wage = calcTotal(gig.nominal, gig.pembayaran);
  const pct = (secs / AUTO_SEC) * 100;

  return (
    <div
      className="fixed top-3 left-3 right-3 z-[200] mx-auto max-w-md rounded-2xl overflow-hidden shadow-2xl border border-emerald-300"
      style={{ animation: "gig-flash 1s ease-in-out 2, slide-down-bounce 0.45s cubic-bezier(0.34,1.56,0.64,1)" }}
    >
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white">
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
                <span className="absolute inline-flex h-full w-full rounded-full bg-white/40 animate-ping" />
                <Radio className="relative w-4 h-4" />
              </span>
              <p className="text-sm font-black leading-tight">
                🔔 NOTIFIKASI BARU
              </p>
            </div>
            <button
              onClick={onDismiss}
              className="text-white/70 hover:text-white shrink-0 transition-colors"
              aria-label="Tutup notifikasi"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-sm font-semibold leading-snug">
            Lowongan Kerja{" "}
            <span className="font-black underline decoration-white/50">
              {gig.posisi}
            </span>{" "}
            Tersedia Dekat Anda!
          </p>

          <div className="flex items-center gap-3 text-xs text-emerald-50">
            <span className="flex items-center gap-1">
              <Banknote className="w-3.5 h-3.5" /> Rp {wage.toLocaleString("id-ID")}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5" /> Dalam radius 5 km
            </span>
          </div>

          <button
            onClick={onView}
            className="w-full bg-white text-emerald-700 font-bold text-sm py-2.5 rounded-xl active:scale-[0.98] transition-transform hover:bg-emerald-50"
          >
            Lihat di Radar
          </button>
        </div>

        <div className="h-1 bg-white/20">
          <div
            className="h-full bg-white"
            style={{ width: `${pct}%`, transition: "width 1s linear" }}
          />
        </div>
      </div>

      <style>{`
        @keyframes gig-flash {
          0%, 100% { box-shadow: 0 10px 30px rgba(6,95,70,0.35); }
          50%      { box-shadow: 0 0 0 4px rgba(16,185,129,0.55), 0 10px 30px rgba(6,95,70,0.5); }
        }
        @keyframes slide-down-bounce {
          0%   { transform: translateY(-120%); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
