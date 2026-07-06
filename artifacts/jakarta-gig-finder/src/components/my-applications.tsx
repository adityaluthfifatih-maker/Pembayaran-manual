import { ClipboardList, Briefcase, Building2, Banknote, Clock, CheckCircle2, XCircle, Hourglass, MessageSquare } from "lucide-react";
import { ApplicationNotification, ApplicationStatus } from "@/types/notification";
import { CustomJob, paymentUnits } from "@/types/custom-job";

interface MyApplicationsProps {
  notifications: ApplicationNotification[];
  customJobs: CustomJob[];
  workerName: string;
  workerId: string;
  onChat: (job: CustomJob, notif: ApplicationNotification) => void;
}

const STATUS_CONFIG: Record<ApplicationStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  baru: {
    label: "Baru",
    cls: "bg-blue-50 border-blue-200 text-blue-700",
    icon: <Hourglass className="w-3.5 h-3.5" />,
  },
  ditinjau: {
    label: "Ditinjau",
    cls: "bg-amber-50 border-amber-200 text-amber-700",
    icon: <Hourglass className="w-3.5 h-3.5" />,
  },
  diterima: {
    label: "Diterima ✓",
    cls: "bg-emerald-50 border-emerald-200 text-emerald-700",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  ditolak: {
    label: "Ditolak",
    cls: "bg-red-50 border-red-200 text-red-600",
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
  selesai: {
    label: "Selesai",
    cls: "bg-gray-50 border-gray-200 text-gray-600",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
};

export default function MyApplications({ notifications, customJobs, workerName, workerId, onChat }: MyApplicationsProps) {
  const myApplications = notifications.filter(
    (n) => n.workerId === workerId || n.applicantName === workerName,
  );

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="p-4 space-y-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" /> Lamaran Saya
          </h2>
          <p className="text-sm text-gray-500">
            {myApplications.length > 0
              ? `${myApplications.length} lamaran terkirim`
              : "Riwayat semua lamaran Anda"}
          </p>
        </div>

        {myApplications.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <ClipboardList className="w-8 h-8 text-primary/40" />
            </div>
            <p className="font-bold text-gray-700 text-sm">Belum ada lamaran</p>
            <p className="text-xs text-gray-400 leading-relaxed max-w-[240px]">
              Lamar lowongan dari feed Radar atau Terjadwal — semua riwayat lamaran Anda akan tampil di sini.
            </p>
          </div>
        ) : (
          myApplications.map((notif) => {
            const job = customJobs.find((j) => j.id === notif.jobId);
            const cfg = STATUS_CONFIG[notif.status ?? "baru"];
            return (
              <div
                key={notif.id}
                className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex flex-col gap-3"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Briefcase className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 truncate">{notif.jobTitle}</p>
                      {job && (
                        <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3 shrink-0 text-primary" />
                          <span className="truncate">{job.namaPerusahaan || "Perusahaan"}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border shrink-0 ${cfg.cls}`}>
                    {cfg.icon}
                    {cfg.label}
                  </div>
                </div>

                {/* Job details */}
                {job && (
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Banknote className="w-3.5 h-3.5 text-primary" />
                      Rp {job.nominal.toLocaleString("id-ID")} / {paymentUnits[job.pembayaran]}
                    </span>
                    {job.hiringMode && (
                      <span className={`flex items-center gap-1 font-semibold ${job.hiringMode === "cepat" ? "text-orange-600" : "text-indigo-600"}`}>
                        {job.hiringMode === "cepat" ? "⚡ Instan" : "📅 Terjadwal"}
                      </span>
                    )}
                  </div>
                )}

                {/* Timestamp */}
                <div className="flex items-center gap-1 text-[10px] text-gray-400">
                  <Clock className="w-3 h-3" />
                  Dilamar {notif.timestamp.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                </div>

                {/* Status message */}
                {notif.status === "diterima" && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2 text-xs text-emerald-700 font-semibold">
                    🎉 Selamat! Lamaran Anda diterima. Silakan clock-in di lokasi kerja.
                  </div>
                )}
                {notif.status === "ditolak" && (
                  <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-xs text-red-600 font-semibold">
                    Lamaran ini tidak dilanjutkan oleh perusahaan.
                  </div>
                )}

                {/* Chat button (only when accepted and job exists) */}
                {notif.status === "diterima" && job && (
                  <button
                    onClick={() => onChat(job, notif)}
                    className="flex items-center justify-center gap-2 w-full bg-primary text-white text-sm font-bold py-2.5 rounded-xl hover:bg-primary/90 active:scale-[0.98] transition-all"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Chat dengan Perusahaan
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
