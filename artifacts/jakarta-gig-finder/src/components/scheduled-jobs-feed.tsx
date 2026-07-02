import { CalendarDays, MapPin, Banknote, Building2, MessageSquare, CalendarClock, Clock } from "lucide-react";
import { CustomJob, paymentUnits } from "@/types/custom-job";
import { Button } from "@/components/ui/button";

interface ScheduledJobsFeedProps {
  jobs: CustomJob[];
  suspended?: boolean;
  onSelect: (job: CustomJob) => void;
  onChat: (job: CustomJob) => void;
}

/**
 * "📅 Cari Kerja Terjadwal" — the dedicated feed for REGULAR (hiringMode
 * "lama") scheduled jobs. These arrive silently in real time over the network
 * (no buzzer, no flashing overlay), unlike instant broadcasts on the radar.
 */
export default function ScheduledJobsFeed({ jobs, suspended, onSelect, onChat }: ScheduledJobsFeedProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <CalendarClock className="w-5 h-5 text-primary" /> Cari Kerja Terjadwal
            </h2>
            <p className="text-sm text-gray-500">
              {jobs.length > 0 ? `${jobs.length} lowongan reguler terjadwal` : "Lowongan reguler akan muncul di sini"}
            </p>
          </div>
        </div>

        {jobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center">
              <CalendarDays className="w-8 h-8 text-emerald-300" />
            </div>
            <p className="font-bold text-gray-700 text-sm">Belum ada lowongan terjadwal</p>
            <p className="text-xs text-gray-400 leading-relaxed max-w-[240px]">
              Lowongan "Posting Reguler" dari perusahaan akan tampil di sini secara otomatis — tanpa alarm.
            </p>
          </div>
        ) : (
          jobs.map((job) => (
            <div
              key={job.id}
              data-testid={`card-scheduled-job-${job.id}`}
              className="bg-white p-4 rounded-xl border border-emerald-100 shadow-sm flex flex-col gap-3"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 truncate">{job.posisi}</h3>
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <Building2 className="w-3 h-3 shrink-0 text-primary" />
                    <span className="truncate">{job.namaPerusahaan || "Rekhastha by Tilu Company"}</span>
                  </p>
                </div>
                <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-1 rounded ml-2 shrink-0">
                  📅 Terjadwal
                </span>
              </div>

              {job.deskripsi && <p className="text-sm text-gray-600 line-clamp-2">{job.deskripsi}</p>}

              <div className="flex items-center gap-2 text-sm">
                <Banknote className="w-4 h-4 text-primary shrink-0" />
                <span className="font-black text-gray-900">
                  Rp {job.nominal.toLocaleString("id-ID")} / {paymentUnits[job.pembayaran]}
                </span>
              </div>

              {(job.jobDate || job.jamKerja || job.alamat) && (
                <div className="flex flex-col gap-1.5 bg-emerald-50/60 border border-emerald-100 rounded-lg px-2.5 py-2 text-[11px] text-gray-600">
                  {job.jobDate && (
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      {new Date(job.jobDate).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    </span>
                  )}
                  {job.jamKerja && (
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> {job.jamKerja}
                    </span>
                  )}
                  {job.alamat && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="line-clamp-1">{job.alamat}</span>
                    </span>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  disabled={suspended}
                  className={`flex-1 font-semibold ${suspended ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-primary hover:bg-primary/90 text-white"}`}
                  onClick={() => !suspended && onSelect(job)}
                >
                  {suspended ? "Ditangguhkan" : "Detail & Lamar"}
                </Button>
                <button
                  onClick={() => onChat(job)}
                  className="px-3 py-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-colors flex items-center justify-center"
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
