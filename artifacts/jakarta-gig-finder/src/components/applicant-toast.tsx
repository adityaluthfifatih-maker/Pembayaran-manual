import { useState, useEffect } from "react";
import { Star, ShieldCheck, X, CheckCircle2, XCircle } from "lucide-react";
import { ApplicationNotification } from "@/types/notification";
import { CustomJob } from "@/types/custom-job";

interface ApplicantToastProps {
  notification: ApplicationNotification;
  job?: CustomJob;
  onAccept: () => void;
  onDecline: () => void;
  onDismiss: () => void;
  /** Clicking the notification body opens the applicant's profile immediately. */
  onOpenProfile?: () => void;
}

function notifCopy(n: ApplicationNotification): string {
  if (n.hiringMode === "cepat") {
    return `Pekerja ${n.applicantName} baru saja mendaftar secara INSTAN pada lowongan ${n.jobTitle} Anda. Klik di sini untuk melihat profil dan menyetujui langsung!`;
  }
  return `Pelamar baru di lowongan REGULER ${n.jobTitle} Anda. Klik di sini untuk melihat profil, CV, dan Portofolio mereka!`;
}

const AUTO_SEC = 10;

export default function ApplicantToast({
  notification, job, onAccept, onDecline, onDismiss, onOpenProfile,
}: ApplicantToastProps) {
  const [secs, setSecs] = useState(AUTO_SEC);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = setInterval(() => {
      setSecs(s => {
        if (s <= 1) { clearInterval(t); onDismiss(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [onDismiss]);

  const accept = () => { setDone(true); onAccept(); setTimeout(onDismiss, 1200); };
  const decline = () => { setDone(true); onDecline(); setTimeout(onDismiss, 700); };

  const pct = (secs / AUTO_SEC) * 100;

  return (
    <div
      className="fixed bottom-20 left-3 right-3 z-[150] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
      style={{ animation: "slide-up-bounce 0.45s cubic-bezier(0.34,1.56,0.64,1)" }}>

      {/* Progress bar */}
      <div className="h-1 bg-gray-100">
        <div
          className="h-full bg-primary"
          style={{ width: `${pct}%`, transition: "width 1s linear" }}
        />
      </div>

      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <p className="text-sm font-black text-gray-900">
              {notification.hiringMode === "cepat" ? "⚡ Pelamar Instan!" : "📩 Pelamar Baru!"}
            </p>
          </div>
          <button onClick={onDismiss} className="text-gray-300 hover:text-gray-500 shrink-0 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notification copy — clicking opens the applicant's profile */}
        <button
          data-testid="button-open-applicant-profile"
          onClick={onOpenProfile}
          disabled={!onOpenProfile}
          className="w-full text-left text-xs font-semibold leading-relaxed text-gray-700 hover:text-primary transition-colors disabled:cursor-default disabled:hover:text-gray-700"
        >
          {notifCopy(notification)}
        </button>

        {/* Applicant */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-sm shrink-0 shadow-md">
            {notification.applicantName.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm truncate">{notification.applicantName}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="flex items-center gap-0.5 text-[11px] font-bold text-amber-600">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> Baru
              </span>
              {notification.hasNpwp && (
                <span className="flex items-center gap-0.5 text-[11px] font-semibold text-emerald-600">
                  <ShieldCheck className="w-3 h-3" /> NPWP ✓
                </span>
              )}
              <span className="text-[10px] text-gray-400">{notification.bank}</span>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 shrink-0">{secs}s</p>
        </div>

        {/* Actions */}
        {done ? (
          <div className="flex items-center justify-center gap-2 py-1">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span className="text-sm font-bold text-emerald-700">Diproses</span>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={decline}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-xs font-bold hover:bg-red-50 hover:text-red-700 transition-colors active:scale-[0.97]">
              <XCircle className="w-3.5 h-3.5" /> Tolak
            </button>
            <button
              onClick={accept}
              className="flex-[2] flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-primary text-white text-xs font-bold shadow-sm active:scale-[0.97] transition-all hover:opacity-90">
              <CheckCircle2 className="w-3.5 h-3.5" /> Terima Pelamar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
