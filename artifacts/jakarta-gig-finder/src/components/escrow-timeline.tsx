import { Lock, AlertTriangle, CheckCircle, RefreshCcw, Clock } from "lucide-react";
import { EscrowEvent, EscrowStatus } from "@/types/escrow";

interface EscrowTimelineProps {
  events: EscrowEvent[];
  filterJobIds?: number[];
  emptyLabel?: string;
}

type StatusCfg = { label: string; color: string; bg: string; border: string; dot: string; icon: React.ComponentType<{ className?: string }> };

const STATUS: Record<EscrowStatus, StatusCfg> = {
  pending:  { label: "Pending",        color: "text-gray-500",    bg: "bg-gray-50",      border: "border-gray-200",    dot: "bg-gray-300",     icon: Clock },
  locked:   { label: "Dana Dikunci",   color: "text-amber-700",   bg: "bg-amber-50",     border: "border-amber-200",   dot: "bg-amber-500",    icon: Lock },
  disputed: { label: "Sengketa Aktif", color: "text-red-700",     bg: "bg-red-50",       border: "border-red-200",     dot: "bg-red-500",      icon: AlertTriangle },
  disputed_active: { label: "Sengketa Aktif", color: "text-red-700", bg: "bg-red-50",    border: "border-red-200",     dot: "bg-red-500",      icon: AlertTriangle },
  released: { label: "Dana Dilepas",   color: "text-emerald-700", bg: "bg-emerald-50",   border: "border-emerald-200", dot: "bg-emerald-500",  icon: CheckCircle },
  refunded: { label: "Refund",         color: "text-gray-700",    bg: "bg-gray-100",     border: "border-gray-200",    dot: "bg-gray-500",     icon: RefreshCcw },
};

const ACTOR: Record<string, string> = {
  system:  "Sistem Rekhastha",
  company: "Perusahaan",
  worker:  "Pekerja",
  admin:   "Admin Platform",
};

function fmt(n: number) { return "Rp " + Math.round(n).toLocaleString("id-ID"); }
function timeStr(d: Date) {
  return d.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function EscrowTimeline({ events, filterJobIds, emptyLabel }: EscrowTimelineProps) {
  const filtered = filterJobIds ? events.filter(e => filterJobIds.includes(e.jobId)) : events;
  const sorted   = [...filtered].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center px-6">
        <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center">
          <Clock className="w-7 h-7 text-gray-200" />
        </div>
        <p className="text-sm font-semibold text-gray-400">{emptyLabel ?? "Belum ada aktivitas escrow"}</p>
        <p className="text-xs text-gray-400 leading-relaxed">
          Setiap perubahan status dana akan tercatat secara real-time di sini — transparan dan tidak dapat diubah.
        </p>
      </div>
    );
  }

  return (
    <div className="relative space-y-3">
      {/* Vertical connecting line */}
      <div className="absolute left-4 top-5 bottom-5 w-0.5 bg-gray-100 z-0" />

      {sorted.map((event, idx) => {
        const cfg = STATUS[event.toStatus] ?? STATUS.pending;
        const Icon = cfg.icon;

        return (
          <div key={event.id} className="relative flex gap-3 items-start">
            {/* Status dot */}
            <div className={`relative z-10 w-9 h-9 rounded-full ${cfg.bg} border-2 ${cfg.border} flex items-center justify-center shrink-0 shadow-sm`}>
              <Icon className={`w-4 h-4 ${cfg.color}`} />
            </div>

            {/* Event card */}
            <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 space-y-1.5 min-w-0">
              {/* Status badge + timestamp row */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
                  {cfg.label}
                </span>
                <span className="text-[10px] text-gray-400 shrink-0">{timeStr(event.timestamp)}</span>
              </div>

              {/* Job title */}
              <p className="text-sm font-bold text-gray-900 truncate">{event.jobTitle}</p>

              {/* Actor + amount row */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[10px] text-gray-500 flex items-center gap-1">
                  <span className="w-4 h-4 flex items-center justify-center text-gray-400">👤</span>
                  {event.actorName ?? (ACTOR[event.actor] || event.actor)}
                </span>
                {event.amount != null && event.amount > 0 && (
                  <span className={`text-[10px] font-black ${
                    event.toStatus === "released" ? "text-emerald-600"
                    : event.toStatus === "disputed" ? "text-red-600"
                    : event.toStatus === "refunded" ? "text-gray-500"
                    : "text-blue-600"
                  }`}>
                    {fmt(event.amount)}
                  </span>
                )}
                {/* Transition arrow */}
                {event.fromStatus && (
                  <span className="text-[10px] text-gray-400">
                    {STATUS[event.fromStatus]?.label ?? event.fromStatus}
                    {" → "}
                    {cfg.label}
                  </span>
                )}
              </div>

              {/* Note */}
              {event.note && (
                <p className="text-[10px] text-gray-400 leading-relaxed border-t border-gray-50 pt-1.5">{event.note}</p>
              )}
            </div>
          </div>
        );
      })}

      {sorted.length >= 5 && (
        <p className="text-center text-[10px] text-gray-400 py-1">Menampilkan {sorted.length} event · Tersimpan permanen di blockchain Rekhastha</p>
      )}
    </div>
  );
}
