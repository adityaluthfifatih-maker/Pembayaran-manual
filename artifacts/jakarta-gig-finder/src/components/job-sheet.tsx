import { CustomJob, calcCommission, calcTotal, paymentLabels } from "@/types/custom-job";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Users, FileText, Shirt, Banknote, Clock } from "lucide-react";

interface JobSheetProps {
  job: CustomJob | null;
  onClose: () => void;
}

function formatRupiah(value: number): string {
  return "Rp " + value.toLocaleString("id-ID");
}

export default function JobSheet({ job, onClose }: JobSheetProps) {
  if (!job) return null;

  const total = calcTotal(job.nominal, job.pembayaran);
  const commission = calcCommission(job.nominal, job.pembayaran);
  const workerGets = total - commission;

  return (
    <Sheet open={!!job} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl p-6 h-[80vh] sm:h-auto overflow-y-auto">
        <div className="flex flex-col gap-5 pt-4">
          {/* Header */}
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center shrink-0">
              <FileText className="w-7 h-7 text-violet-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-gray-900 leading-tight">{job.posisi}</h2>
                <Badge className="bg-violet-100 text-violet-700 border-0 text-xs font-semibold">Lowongan Baru</Badge>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Users className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-sm text-gray-500">{job.kuota} orang dibutuhkan</span>
              </div>
            </div>
          </div>

          {/* Deskripsi */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-gray-700 uppercase tracking-wide">Deskripsi & Tugas</h3>
            <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 p-3.5 rounded-xl border border-gray-100">
              {job.deskripsi}
            </p>
          </div>

          {/* Persyaratan Pakaian */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
              <Shirt className="w-4 h-4" /> Persyaratan Pakaian
            </h3>
            <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 p-3.5 rounded-xl border border-gray-100">
              {job.dresscode}
            </p>
          </div>

          {/* Biaya */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm text-gray-700 uppercase tracking-wide flex items-center gap-1.5">
              <Banknote className="w-4 h-4" /> Detail Pembayaran
            </h3>
            <div className="bg-primary/5 border border-primary/10 p-4 rounded-xl space-y-2.5">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Sistem Bayaran
                </span>
                <span className="font-semibold text-gray-900">{paymentLabels[job.pembayaran]}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-600">
                  {job.pembayaran === "per_jam" ? `${formatRupiah(job.nominal)} × 8 jam` : "Total pembayaran"}
                </span>
                <span className="font-medium text-gray-900">{formatRupiah(total)}</span>
              </div>
              <div className="flex justify-between items-center text-sm border-t border-primary/10 pt-2">
                <span className="text-gray-500">Biaya layanan platform (15%)</span>
                <span className="text-gray-500">−{formatRupiah(commission)}</span>
              </div>
              <div className="flex justify-between items-center border-t border-primary/10 pt-2">
                <span className="font-bold text-gray-800">Penghasilan bersih Anda</span>
                <span className="font-bold text-primary text-lg">{formatRupiah(workerGets)}</span>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="pt-1 pb-6">
            <button
              data-testid="button-apply-job"
              className="w-full bg-violet-600 hover:bg-violet-700 active:scale-[0.98] text-white font-bold py-3.5 rounded-xl text-base transition-all shadow-lg"
              style={{ boxShadow: "0 4px 16px rgba(124,58,237,0.3)" }}
              onClick={() => {
                const text = `Halo, saya tertarik dengan lowongan ${job.posisi} yang Anda posting di Jakarta Gig Finder. Apakah posisi ini masih tersedia?`;
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`);
              }}
            >
              Lamar Sekarang
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
