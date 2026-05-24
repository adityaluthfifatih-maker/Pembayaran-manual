import { X, TrendingUp, Banknote, ShieldCheck, AlertCircle, Star, FileText } from "lucide-react";
import { WorkerProfile, pph21Rate, isVerified } from "@/types/worker-profile";
import { ApplicationNotification } from "@/types/notification";

interface EarningsDashboardProps {
  workerProfile: WorkerProfile;
  reputationPoints: number;
  completedJobs: ApplicationNotification[];
  totalEarned: number;
  onDownloadSlip: () => void;
  onClose: () => void;
}

function formatRp(v: number) { return "Rp " + v.toLocaleString("id-ID"); }

export default function EarningsDashboard({
  workerProfile, reputationPoints, completedJobs, totalEarned, onDownloadSlip, onClose,
}: EarningsDashboardProps) {
  const pphRate = pph21Rate(workerProfile);
  const totalGross = totalEarned;
  const totalCommission = Math.round(totalGross * 0.15);
  const totalPph = Math.round(totalGross * pphRate);
  const totalNet = totalGross - totalCommission - totalPph;
  const verified = isVerified(workerProfile);

  const repColor = reputationPoints >= 80 ? "text-primary" : reputationPoints >= 50 ? "text-amber-600" : "text-red-600";
  const repBg = reputationPoints >= 80 ? "bg-primary" : reputationPoints >= 50 ? "bg-amber-500" : "bg-red-500";

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col justify-end"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)" }}
    >
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="relative bg-white rounded-t-3xl w-full max-h-[88vh] overflow-y-auto"
        style={{ animation: "slideUp 0.28s cubic-bezier(0.32,0.72,0,1)" }}
      >
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-gray-200" /></div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-gray-900">Dashboard Pekerja</h2>
            <p className="text-xs text-gray-500 mt-0.5">{workerProfile.namaLengkap}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100">
            <X className="w-4 h-4 text-gray-600" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* Verification badge */}
          <div className={`flex items-center gap-3 p-3.5 rounded-xl border ${verified ? "bg-primary/5 border-primary/15" : "bg-amber-50 border-amber-200"}`}>
            {verified
              ? <ShieldCheck className="w-5 h-5 text-primary shrink-0" />
              : <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />}
            <div>
              <p className={`text-sm font-bold ${verified ? "text-primary" : "text-amber-700"}`}>
                {verified ? "Akun Terverifikasi Pajak" : "Profil Belum Lengkap"}
              </p>
              <p className="text-xs text-gray-500">
                {verified ? "Data KTP, NPWP, dan rekening terverifikasi" : "Lengkapi data untuk meningkatkan kepercayaan perusahaan"}
              </p>
            </div>
          </div>

          {/* Reputation points */}
          <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-gray-800">Poin Reputasi</p>
              <span className={`text-lg font-black ${repColor}`}>{reputationPoints}/100</span>
            </div>
            <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${repBg}`}
                style={{ width: `${reputationPoints}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mt-1.5">
              <span>Suspended (&lt;50)</span>
              <span>Aktif (50-79)</span>
              <span>Terpercaya (80+)</span>
            </div>
            {reputationPoints < 50 && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                <p className="text-xs font-bold text-red-600">Akun Ditangguhkan</p>
                <p className="text-[11px] text-red-500 mt-0.5">Poin reputasi di bawah 50. Hubungi admin untuk pemulihan akun.</p>
              </div>
            )}
          </div>

          {/* Earnings summary */}
          <div>
            <p className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-primary" /> Ringkasan Penghasilan
            </p>
            <div className="bg-primary text-white rounded-2xl p-5 space-y-3">
              <div className="text-center">
                <p className="text-xs opacity-70">Total Penghasilan Bersih</p>
                <p className="text-3xl font-black mt-0.5">{formatRp(Math.max(0, totalNet))}</p>
              </div>
              <div className="border-t border-white/20 pt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="opacity-70">Total Kotor</span>
                  <span className="font-semibold">{formatRp(totalGross)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="opacity-70">Komisi Platform (15%)</span>
                  <span className="font-semibold">- {formatRp(totalCommission)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="opacity-70">PPh 21 ({workerProfile.belumPunyaNpwp ? "6%" : "5%"})</span>
                  <span className="font-semibold">- {formatRp(totalPph)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Rekening info */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-2">
            <p className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
              <Banknote className="w-4 h-4" /> Rekening Pencairan
            </p>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Bank</span>
              <span className="font-semibold text-gray-900">{workerProfile.namaBank || "—"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Rekening</span>
              <span className="font-semibold text-gray-900">{workerProfile.nomorRekening || "—"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Atas Nama</span>
              <span className="font-semibold text-gray-900">{workerProfile.namaRekening || workerProfile.namaLengkap}</span>
            </div>
          </div>

          {/* Completed jobs */}
          {completedJobs.length > 0 && (
            <div>
              <p className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400" /> Riwayat Pekerjaan ({completedJobs.length})
              </p>
              <div className="space-y-2">
                {completedJobs.slice(0, 3).map((n) => (
                  <div key={n.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-900 truncate">{n.jobTitle}</p>
                      <p className="text-[10px] text-gray-500">{n.timestamp.toLocaleDateString("id-ID")}</p>
                    </div>
                    <span className="text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      {n.status === "diterima" ? "Selesai" : "Diproses"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Download slip */}
          <div className="pb-4">
            <button
              data-testid="button-download-slip-dashboard"
              onClick={onDownloadSlip}
              className="w-full border-2 border-primary text-primary font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-primary/5 active:scale-[0.98] transition-all"
            >
              <FileText className="w-5 h-5" />
              Unduh Slip Gaji & Bukti Potong PPh 21
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes slideUp { from{transform:translateY(100%);opacity:0.6} to{transform:translateY(0);opacity:1} }`}</style>
    </div>
  );
}
