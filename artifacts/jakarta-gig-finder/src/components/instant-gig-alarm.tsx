import { useEffect, useRef } from "react";
import { Zap, Banknote, Building2, MapPin } from "lucide-react";
import { CustomJob, paymentUnits } from "@/types/custom-job";
import { playAlarmBuzzer } from "@/lib/central-server";

interface InstantGigAlarmProps {
  gig: CustomJob;
  onAccept: () => void;
  onSkip: () => void;
}

/**
 * Persistent, full-screen alarm for a new "Broadcast Instan" — fires ONLY when
 * the worker's radar is ON. A loud looping buzzer (every 2s) plus a flashing
 * red/emerald overlay that WILL NOT STOP until the worker taps one of the two
 * action buttons. The buzzer loop lives here so it is guaranteed to run for the
 * entire time this component is mounted and clears on unmount.
 */
export default function InstantGigAlarm({ gig, onAccept, onSkip }: InstantGigAlarmProps) {
  const loopRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    playAlarmBuzzer();
    loopRef.current = setInterval(() => playAlarmBuzzer(), 2000);
    return () => {
      if (loopRef.current) clearInterval(loopRef.current);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center px-4"
      style={{ animation: "instant-alarm-flash 0.85s steps(1, end) infinite" }}
    >
      <div className="absolute inset-0 bg-black/40" />

      <div
        className="relative w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border-4 border-white"
        style={{ animation: "instant-alarm-shake 0.5s ease-in-out infinite" }}
      >
        {/* Gold accent strip */}
        <div className="h-2 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-300" />

        <div className="bg-gray-950 p-5 space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-full w-full rounded-full bg-red-500/60 animate-ping" />
              <span
                className="relative w-11 h-11 rounded-2xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg,#dc2626,#f97316)" }}
              >
                <Zap className="w-6 h-6 text-white" />
              </span>
            </span>
            <div>
              <p className="text-xs font-black text-red-400 uppercase tracking-widest">
                🚨 Broadcast Instan!
              </p>
              <p className="text-[10px] text-gray-500">
                Rekhastha <span className="opacity-80">(by Tilu Company)</span> · Radar Aktif
              </p>
            </div>
          </div>

          <div className="text-center py-1">
            <h2 className="text-3xl font-black text-white tracking-tight leading-tight">
              {gig.posisi}
            </h2>
            <p className="text-sm text-gray-400 mt-1 flex items-center justify-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              {gig.namaPerusahaan || "Rekhastha by Tilu Company"}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-emerald-950/60 border border-emerald-800/60 rounded-2xl p-3 text-center">
              <Banknote className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
              <p className="text-sm font-black text-white leading-none">
                Rp {gig.nominal.toLocaleString("id-ID")}
              </p>
              <p className="text-[9px] text-emerald-500/80 mt-1">
                / {paymentUnits[gig.pembayaran]}
              </p>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-3 text-center">
              <MapPin className="w-4 h-4 text-amber-400 mx-auto mb-1" />
              <p className="text-sm font-black text-white leading-none">Radius 5 km</p>
              <p className="text-[9px] text-gray-500 mt-1">Escrow Aman 🔒</p>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={onSkip}
              className="flex-1 h-12 rounded-2xl font-black text-sm bg-gray-900 border border-gray-700 text-gray-300 flex items-center justify-center gap-1.5 hover:bg-gray-800 active:scale-95 transition-all"
            >
              ❌ Lewati
            </button>
            <button
              onClick={onAccept}
              className="flex-[1.4] h-12 rounded-2xl font-black text-sm text-white flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
              style={{
                background: "linear-gradient(135deg,#059669,#10b981)",
                boxShadow: "0 6px 24px rgba(16,185,129,0.4)",
              }}
            >
              🟢 Terima Kerja (Buka Radar)
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes instant-alarm-flash {
          0%   { background-color: rgba(185,28,28,0.62); }
          50%  { background-color: rgba(6,95,70,0.62); }
          100% { background-color: rgba(185,28,28,0.62); }
        }
        @keyframes instant-alarm-shake {
          0%, 100% { transform: translateX(0) scale(1); }
          25%      { transform: translateX(-4px) scale(1.01); }
          75%      { transform: translateX(4px) scale(1.01); }
        }
      `}</style>
    </div>
  );
}
