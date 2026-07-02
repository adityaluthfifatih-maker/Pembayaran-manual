import { useState } from "react";
import {
  CustomJob, calcCommission, calcTotal, paymentLabels,
  durasiKontrakOptions,
} from "@/types/custom-job";
import { WorkerProfile, isVerified } from "@/types/worker-profile";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  Users, FileText, Shirt, Banknote, CheckCircle, ShieldCheck,
  Loader2, MessageSquare, AlertTriangle, Calendar, Building2,
} from "lucide-react";

interface JobSheetProps {
  job: CustomJob | null;
  onClose: () => void;
  workerProfile?: WorkerProfile | null;
  onApply?: (job: CustomJob, profile: WorkerProfile) => void;
  onOpenChat?: (job: CustomJob) => void;
  onReportSuspect?: (jobId: number) => void;
}

function formatRp(value: number): string {
  return "Rp " + value.toLocaleString("id-ID");
}

type ApplyState = "idle" | "sending" | "done";

export default function JobSheet({
  job, onClose, workerProfile, onApply, onOpenChat, onReportSuspect,
}: JobSheetProps) {
  const [applyState, setApplyState] = useState<ApplyState>("idle");

  if (!job) return null;

  const total = calcTotal(job.nominal, job.pembayaran);
  const commission = calcCommission(job.nominal, job.pembayaran, job.durasiKontrak);
  const commRate = durasiKontrakOptions.find((o) => o.value === (job.durasiKontrak ?? "harian"))?.rate ?? 0.15;
  const workerGets = total - commission;
  const verified = workerProfile ? isVerified(workerProfile) : false;
  const durasiLabel = durasiKontrakOptions.find((o) => o.value === (job.durasiKontrak ?? "harian"))?.label ?? "Harian";

  const handleApply = () => {
    if (applyState !== "idle") return;
    setApplyState("sending");
    setTimeout(() => {
      setApplyState("done");
      if (workerProfile && onApply) onApply(job, workerProfile);
    }, 2000);
  };

  return (
    <Sheet open={!!job} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl p-6 h-[82vh] sm:h-auto overflow-y-auto">
        <div className="flex flex-col gap-5 pt-4">

          {/* Header */}
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center shrink-0">
              <FileText className="w-7 h-7 text-violet-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-gray-900 leading-tight">{job.posisi}</h2>
                <Badge className="bg-violet-100 text-violet-700 border-0 text-xs font-semibold">Lowongan Kustom</Badge>
                {job.flaggedSuspect && (
                  <Badge className="bg-yellow-100 text-yellow-700 border-0 text-xs">⚠️ Sedang Ditinjau</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Users className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-sm text-gray-500">{job.kuota} orang dibutuhkan</span>
                {job.namaPerusahaan && (
                  <span className="flex items-center gap-1 text-[10px] text-gray-500">
                    <Building2 className="w-3 h-3" /> {job.namaPerusahaan}
                  </span>
                )}
                {job.nibPerusahaan?.length === 13 && (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    <ShieldCheck className="w-3 h-3" /> NIB Terverifikasi
                  </span>
                )}
                {verified && (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    <ShieldCheck className="w-3 h-3" /> Akun Terverifikasi
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Durasi kontrak */}
          <div className="flex items-center gap-2 bg-primary/5 border border-primary/10 rounded-xl px-4 py-2.5">
            <Calendar className="w-4 h-4 text-primary shrink-0" />
            <div>
              <p className="text-xs font-semibold text-primary">{durasiLabel}</p>
              <p className="text-[10px] text-gray-500">Komisi platform: {(commRate * 100)}%</p>
            </div>
          </div>

          {/* Deskripsi */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-gray-700 uppercase tracking-wide">Deskripsi & Tugas</h3>
            <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 p-3.5 rounded-xl border border-gray-100">
              {job.deskripsi}
            </p>
          </div>

          {/* Dresscode */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
              <Shirt className="w-4 h-4" /> Persyaratan Pakaian
            </h3>
            <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 p-3.5 rounded-xl border border-gray-100">
              {job.dresscode}
            </p>
          </div>

          {/* Kalkulasi */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
              <Banknote className="w-4 h-4" /> Kalkulasi Penghasilan Bersih
            </h3>
            <div className="bg-primary/5 border border-primary/10 p-4 rounded-xl space-y-2.5">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Sistem Bayaran</span>
                <span className="font-semibold text-gray-900">{paymentLabels[job.pembayaran]}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">
                  {job.pembayaran === "per_jam" ? `${formatRp(job.nominal)} × 8 jam` : "Total kotor"}
                </span>
                <span className="font-medium text-gray-900">{formatRp(total)}</span>
              </div>
              <div className="border-t border-primary/10 pt-2 space-y-1.5">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Komisi platform ({(commRate * 100)}%)</span>
                  <span>−{formatRp(commission)}</span>
                </div>
              </div>
              <div className="flex justify-between border-t border-primary/10 pt-2.5">
                <span className="font-bold text-gray-800">Anda terima bersih</span>
                <span className="font-bold text-primary text-lg">{formatRp(workerGets)}</span>
              </div>
              <p className="text-[10px] text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 leading-relaxed">
                Segala kewajiban perpajakan menjadi tanggung jawab mandiri masing-masing pihak sesuai hukum yang berlaku.
              </p>
            </div>
          </div>

          {/* Worker identity */}
          {workerProfile && (
            <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-gray-600">Data yang akan dikirim ke perusahaan:</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1">
                {[
                  ["Nama", workerProfile.namaLengkap],
                  ["NIK", `${workerProfile.nik.slice(0, 4)}••••••••${workerProfile.nik.slice(-4)}`],
                  ["NPWP", workerProfile.belumPunyaNpwp ? "Belum ada" : `••••••${workerProfile.npwp.slice(-4)}`],
                  ["Bank", workerProfile.namaBank || "—"],
                ].map(([label, val]) => (
                  <div key={label}>
                    <p className="text-[10px] text-gray-400">{label}</p>
                    <p className="text-xs font-semibold text-gray-800 truncate">{val}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="pt-1 pb-2 space-y-3">
            {applyState === "idle" && (
              <button
                data-testid="button-apply-job"
                className="w-full bg-primary hover:bg-primary/90 active:scale-[0.98] text-white font-bold py-3.5 rounded-xl text-base transition-all shadow-lg"
                style={{ boxShadow: "0 4px 16px rgba(6,95,70,0.35)" }}
                onClick={handleApply}
              >
                Lamar Pekerjaan Ini
              </button>
            )}

            {applyState === "sending" && (
              <div className="w-full bg-primary/10 border border-primary/20 text-primary font-semibold py-3.5 rounded-xl text-sm flex items-center justify-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin" />
                Mengirim data legalitas secara aman...
              </div>
            )}

            {applyState === "done" && (
              <div className="space-y-3">
                <div className="w-full bg-primary text-white font-semibold py-3.5 rounded-xl text-sm flex items-center justify-center gap-2">
                  <CheckCircle className="w-5 h-5" />
                  Lamaran Terkirim!
                </div>
                {onOpenChat && (
                  <button
                    data-testid="button-open-chat-from-sheet"
                    onClick={() => { onClose(); onOpenChat(job); }}
                    className="w-full flex items-center justify-center gap-2 border-2 border-primary text-primary font-bold py-3 rounded-xl text-sm hover:bg-primary/5 transition-colors"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Buka Chat Aplikasi
                  </button>
                )}
                <div className="bg-primary/5 border border-primary/15 rounded-xl px-4 py-3">
                  <p className="text-xs text-gray-700 text-center leading-relaxed">
                    Perusahaan akan memvalidasi identitas dan kelengkapan data Anda.
                  </p>
                </div>
              </div>
            )}

            {/* Report suspicious */}
            {onReportSuspect && applyState === "idle" && (
              <button
                data-testid="button-report-suspect"
                onClick={() => { onReportSuspect(job.id); onClose(); }}
                className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-red-500 border border-red-200 bg-red-50 py-2.5 rounded-xl hover:bg-red-100 transition-colors"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Laporkan Lowongan Mencurigakan
              </button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
