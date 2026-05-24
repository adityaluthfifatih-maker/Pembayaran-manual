import { useState, useRef, useCallback } from "react";
import { AlertTriangle, X, CheckCircle } from "lucide-react";

function playSiren() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const times = [0, 0.5, 1.0, 1.5, 2.0];
    times.forEach((t) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(440, ctx.currentTime + t);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + t + 0.25);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + t + 0.5);
      gain.gain.setValueAtTime(0.4, ctx.currentTime + t);
      gain.gain.setValueAtTime(0, ctx.currentTime + t + 0.5);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.5);
    });
  } catch (_) {}
}

type SOSState = "idle" | "holding" | "activated";

interface SOSButtonProps {
  jobTitle: string;
}

export default function SOSButton({ jobTitle }: SOSButtonProps) {
  const [state, setState] = useState<SOSState>("idle");
  const [progress, setProgress] = useState(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [showPanel, setShowPanel] = useState(false);

  const startHold = useCallback(() => {
    setState("holding");
    setProgress(0);
    const start = Date.now();
    progressTimer.current = setInterval(() => {
      const pct = Math.min(((Date.now() - start) / 3000) * 100, 100);
      setProgress(pct);
    }, 30);
    holdTimer.current = setTimeout(() => {
      if (progressTimer.current) clearInterval(progressTimer.current);
      setState("activated");
      setProgress(100);
      setShowPanel(true);
      playSiren();
    }, 3000);
  }, []);

  const endHold = useCallback(() => {
    if (state === "activated") return;
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (progressTimer.current) clearInterval(progressTimer.current);
    setState("idle");
    setProgress(0);
  }, [state]);

  const reset = () => {
    setState("idle");
    setProgress(0);
    setShowPanel(false);
  };

  return (
    <>
      {/* SOS Floating Button */}
      <div
        className="fixed bottom-20 right-4 z-[100] select-none"
        onMouseDown={startHold}
        onMouseUp={endHold}
        onMouseLeave={endHold}
        onTouchStart={startHold}
        onTouchEnd={endHold}
      >
        <div className="relative">
          {/* Progress ring */}
          {state === "holding" && (
            <svg
              className="absolute inset-0 -m-1.5 w-[72px] h-[72px]"
              viewBox="0 0 72 72"
            >
              <circle
                cx="36" cy="36" r="31"
                fill="none"
                stroke="#ef4444"
                strokeWidth="4"
                strokeDasharray={`${2 * Math.PI * 31 * progress / 100} ${2 * Math.PI * 31}`}
                strokeLinecap="round"
                transform="rotate(-90 36 36)"
                style={{ transition: "stroke-dasharray 0.03s linear" }}
              />
            </svg>
          )}

          <button
            data-testid="button-sos"
            className={`w-[60px] h-[60px] rounded-full flex items-center justify-center flex-col gap-0.5 shadow-xl transition-all select-none ${
              state === "activated"
                ? "bg-red-700 scale-95"
                : state === "holding"
                ? "bg-red-600 scale-105"
                : "bg-red-500 hover:bg-red-600 active:scale-95"
            }`}
            style={{ boxShadow: "0 4px 20px rgba(239,68,68,0.5)", WebkitUserSelect: "none" }}
          >
            <AlertTriangle className="w-5 h-5 text-white" />
            <span className="text-white text-[9px] font-black leading-none">SOS</span>
          </button>
        </div>
        {state === "holding" && (
          <p className="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-bold text-red-600 whitespace-nowrap bg-white/90 px-2 py-0.5 rounded-full shadow">
            Tahan 3 detik...
          </p>
        )}
      </div>

      {/* SOS Activated Panel */}
      {showPanel && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
        >
          <div
            className="bg-white rounded-3xl p-6 max-w-sm w-full text-center space-y-4"
            style={{ animation: "sosAppear 0.3s cubic-bezier(0.175,0.885,0.32,1.275)" }}
          >
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <div>
              <h2 className="text-xl font-black text-red-600">SINYAL SOS TERKIRIM!</h2>
              <p className="text-sm text-gray-600 mt-1">Pekerjaan: <span className="font-semibold">{jobTitle}</span></p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-xs text-red-700 font-semibold text-left">Peringatan Bahaya dikirim ke Pusat Komando Admin!</p>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-xs text-red-700 text-left">Koordinat GPS Anda sedang dilacak secara real-time</p>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-xs text-red-700 text-left">Tim respons darurat sedang dihubungi</p>
              </div>
            </div>
            <p className="text-xs text-gray-500">Tetap tenang. Bantuan sedang dalam perjalanan.</p>
            <button
              data-testid="button-sos-dismiss"
              onClick={reset}
              className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl text-sm hover:bg-gray-200 transition-colors"
            >
              <X className="w-4 h-4" /> Tutup
            </button>
          </div>
        </div>
      )}
      <style>{`
        @keyframes sosAppear {
          from { transform: scale(0.7); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </>
  );
}
