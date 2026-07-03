import { Bell, X, ShieldCheck, AlertCircle, CheckCircle, Clock, ChevronRight, Inbox, MessageSquare } from "lucide-react";
import { ApplicationNotification, ApplicationStatus } from "@/types/notification";
import { useState } from "react";

interface NotificationPanelProps {
  notifications: ApplicationNotification[];
  onStatusChange: (id: number, status: ApplicationStatus) => void;
  onOpenChat?: (notif: ApplicationNotification) => void;
  onMarkComplete?: (notifId: number) => void;
  onDispute?: (notifId: number) => void;
}

const statusConfig: Record<ApplicationStatus, { label: string; color: string; bg: string }> = {
  baru:     { label: "Baru",     color: "text-violet-700",  bg: "bg-violet-100"  },
  ditinjau: { label: "Ditinjau", color: "text-amber-700",   bg: "bg-amber-100"   },
  diterima: { label: "Diterima", color: "text-primary",     bg: "bg-primary/10"  },
  ditolak:  { label: "Ditolak",  color: "text-red-600",     bg: "bg-red-100"     },
  selesai:  { label: "Dibayar ✓", color: "text-emerald-700", bg: "bg-emerald-100" },
};

function timeAgo(date: Date): string {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60)   return "Baru saja";
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  return `${Math.floor(s / 3600)} jam lalu`;
}

export default function NotificationPanel({ notifications, onStatusChange, onOpenChat, onMarkComplete, onDispute }: NotificationPanelProps) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const unread = notifications.filter((n) => n.status === "baru").length;

  return (
    <>
      <button
        data-testid="button-notification-bell"
        onClick={() => setOpen(true)}
        className="relative flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
      >
        <Bell className="w-4 h-4 text-gray-600" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[150]"
          style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(2px)" }}
        >
          <div className="absolute inset-0" onClick={() => setOpen(false)} />

          <div
            className="absolute top-0 right-0 bottom-0 w-full max-w-sm bg-white flex flex-col shadow-2xl"
            style={{ animation: "slideInRight 0.26s cubic-bezier(0.32,0.72,0,1)" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
              <div>
                <h2 className="font-bold text-gray-900 text-base">Lamaran Masuk</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {notifications.length === 0
                    ? "Belum ada pelamar"
                    : `${notifications.length} total · ${unread} belum ditinjau`}
                </p>
              </div>
              <button
                data-testid="button-close-notifications"
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <X className="w-4 h-4 text-gray-600" />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
                  <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center">
                    <Inbox className="w-8 h-8 text-gray-300" />
                  </div>
                  <p className="text-sm font-semibold text-gray-400">Belum Ada Lamaran</p>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Lamaran dari pekerja akan muncul di sini setelah mereka mendaftar ke lowongan Anda.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {notifications.map((n) => {
                    const cfg = statusConfig[n.status];
                    const isExpanded = expanded === n.id;
                    return (
                      <div
                        key={n.id}
                        data-testid={`notification-item-${n.id}`}
                        className="px-5 py-4 hover:bg-gray-50 transition-colors"
                      >
                        {/* Top row */}
                        <div
                          className="flex items-start gap-3 cursor-pointer"
                          onClick={() => setExpanded(isExpanded ? null : n.id)}
                        >
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-sm">
                            {n.applicantName.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-gray-900 truncate">{n.applicantName}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                                {cfg.label}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5 truncate">
                              Melamar: <span className="font-medium text-gray-700">{n.jobTitle}</span>
                            </p>
                            <div className="flex items-center gap-3 mt-1">
                              {n.hasNpwp ? (
                                <span className="flex items-center gap-1 text-[10px] font-semibold text-primary">
                                  <ShieldCheck className="w-3 h-3" /> NPWP Terverifikasi
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600">
                                  <AlertCircle className="w-3 h-3" /> Tanpa NPWP
                                </span>
                              )}
                              <span className="flex items-center gap-1 text-[10px] text-gray-400">
                                <Clock className="w-3 h-3" /> {timeAgo(n.timestamp)}
                              </span>
                            </div>
                          </div>
                          <ChevronRight className={`w-4 h-4 text-gray-400 shrink-0 mt-1 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                        </div>

                        {/* Expanded */}
                        {isExpanded && (
                          <div className="mt-4 space-y-3" style={{ animation: "fadeIn 0.15s ease" }}>
                            <div className="bg-gray-50 rounded-xl p-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
                              <DataRow label="NIK"         value={n.applicantNikMasked} />
                              <DataRow label="NPWP"        value={n.applicantNpwpMasked} warn={!n.hasNpwp} />
                              <DataRow label="Bank"        value={n.bank} />
                              <DataRow label="No. Rekening" value={n.rekening} />
                            </div>

                            <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                              <ShieldCheck className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" />
                              <p className="text-[11px] text-gray-600 leading-relaxed">
                                Segala kewajiban perpajakan menjadi tanggung jawab mandiri masing-masing pihak sesuai hukum yang berlaku.
                              </p>
                            </div>

                            {/* Open chat button (only available once worker is accepted) */}
                            {onOpenChat && n.status === "diterima" && (
                              <button
                                data-testid={`button-open-chat-notif-${n.id}`}
                                onClick={() => { setOpen(false); onOpenChat(n); }}
                                className="w-full flex items-center justify-center gap-2 bg-primary/5 border border-primary/20 text-primary text-xs font-bold py-2.5 rounded-xl hover:bg-primary/10 transition-colors"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                Buka Chat dengan Pekerja
                              </button>
                            )}

                            {/* Action buttons */}
                            {(n.status === "baru" || n.status === "ditinjau") ? (
                              <div className="flex gap-2 pt-1">
                                <button
                                  data-testid={`button-accept-${n.id}`}
                                  onClick={() => onStatusChange(n.id, "diterima")}
                                  className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-white text-xs font-bold py-2.5 rounded-xl hover:bg-primary/90 active:scale-[0.97] transition-all"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" /> Terima
                                </button>
                                <button
                                  data-testid={`button-review-${n.id}`}
                                  onClick={() => onStatusChange(n.id, "ditinjau")}
                                  className="flex-1 flex items-center justify-center gap-1.5 bg-gray-100 text-gray-700 text-xs font-bold py-2.5 rounded-xl hover:bg-gray-200 transition-colors"
                                >
                                  Tinjau
                                </button>
                                <button
                                  data-testid={`button-reject-${n.id}`}
                                  onClick={() => onStatusChange(n.id, "ditolak")}
                                  className="flex items-center justify-center px-3 bg-red-50 text-red-500 text-xs font-bold py-2.5 rounded-xl hover:bg-red-100 transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : n.status === "diterima" ? (
                              <div className="space-y-2 pt-1">
                                {/* Escrow guarantee badge */}
                                <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                                  <span className="text-blue-600 text-[11px] font-bold">🔒 Gaji Terjamin di Escrow Rekhastha</span>
                                </div>
                                <div className="flex gap-2">
                                  {onMarkComplete && (
                                    <button
                                      data-testid={`button-complete-${n.id}`}
                                      onClick={() => { onMarkComplete(n.id); setOpen(false); }}
                                      className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-white text-xs font-bold py-2.5 rounded-xl hover:bg-primary/90 active:scale-[0.97] transition-all"
                                    >
                                      <CheckCircle className="w-3.5 h-3.5" /> Selesai &amp; Bayar Pekerja
                                    </button>
                                  )}
                                  {onDispute && (
                                    <button
                                      data-testid={`button-dispute-${n.id}`}
                                      onClick={() => { onDispute(n.id); setOpen(false); }}
                                      className="flex items-center justify-center gap-1 px-3 bg-amber-50 text-amber-600 text-xs font-bold py-2.5 rounded-xl hover:bg-amber-100 transition-colors border border-amber-200"
                                    >
                                      ⚠️ Sengketa
                                    </button>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className={`text-center text-xs font-semibold py-2 rounded-xl ${cfg.bg} ${cfg.color}`}>
                                Status: {cfg.label}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideInRight { from{transform:translateX(100%);opacity:0.6} to{transform:translateX(0);opacity:1} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </>
  );
}

function DataRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-gray-400">{label}</p>
      <p className={`text-xs font-semibold truncate ${warn ? "text-amber-600" : "text-gray-800"}`}>{value}</p>
    </div>
  );
}
