import { useMemo } from "react";
import {
  TrendingUp, DollarSign, Star, Briefcase, Zap, BarChart2,
  ArrowUpRight, Shield, Users,
} from "lucide-react";
import { CustomJob, calcTotal, durasiKontrakOptions } from "@/types/custom-job";
import { calcEmployerFee, PLATFORM_FEE_CEPAT } from "@/types/escrow";
import { RatingPayload } from "@/components/rating-modal";

interface AnalyticsDashboardProps {
  customJobs: CustomJob[];
  ratings: RatingPayload[];
  totalApplicants: number;
}

function fmt(n: number) { return "Rp " + Math.round(n).toLocaleString("id-ID"); }


export default function AnalyticsDashboard({ customJobs, ratings, totalApplicants }: AnalyticsDashboardProps) {
  // ── Computed metrics ────────────────────────────────────────────
  const metrics = useMemo(() => {
    let totalGross = 0;
    let totalComm = 0;
    customJobs.forEach((job) => {
      const g = calcTotal(job.nominal, job.pembayaran);
      const c = calcEmployerFee(g);
      totalGross += g;
      totalComm += c;
    });

    const workerRatings = ratings.filter((r) => r.raterType === "company");
    const avgRating = workerRatings.length
      ? workerRatings.reduce((s, r) => s + r.stars, 0) / workerRatings.length
      : 0;

    const agencies = customJobs.filter((j) => j.isAgency).length;

    return { totalGross, totalComm, avgRating, agencies };
  }, [customJobs, ratings]);

  // ── Per-job breakdown ────────────────────────────────────────────
  const jobBreakdowns = useMemo(() =>
    customJobs.map((job) => {
      const gross = calcTotal(job.nominal, job.pembayaran);
      const comm = calcEmployerFee(gross);
      const workerPay = gross;
      const rate = comm / gross;
      return { job, gross, comm, workerPay, rate };
    }),
  [customJobs]);

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{ background: "#0F172A" }}
    >
      <div className="p-4 space-y-5 pb-8">

        {/* Header */}
        <div className="pt-2">
          <div className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-black text-white tracking-tight">Analitik Keuangan & Performa</h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Real-time · Auto-refresh setiap transaksi baru</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <MetricCard
            icon={<DollarSign className="w-4 h-4" />}
            label="Total Pengeluaran"
            value={fmt(metrics.totalGross)}
            sub={`${customJobs.length} lowongan aktif`}
            accent="emerald"
          />
          <MetricCard
            icon={<TrendingUp className="w-4 h-4" />}
            label="Total Komisi"
            value={fmt(metrics.totalComm)}
            sub={customJobs.length ? `${((metrics.totalComm / metrics.totalGross) * 100 || 0).toFixed(1)}% dari pengeluaran` : "—"}
            accent="blue"
          />
          <MetricCard
            icon={<Star className="w-4 h-4 fill-amber-400 text-amber-400" />}
            label="Rata-Rata Rating"
            value={metrics.avgRating ? metrics.avgRating.toFixed(1) + " ★" : "—"}
            sub={`${ratings.filter(r => r.raterType === "company").length} ulasan`}
            accent="amber"
          />
          <MetricCard
            icon={<Users className="w-4 h-4" />}
            label="Total Pelamar"
            value={String(totalApplicants)}
            sub={`${metrics.agencies} lowongan Agensi`}
            accent="violet"
          />
        </div>

        {/* Platform fee transparency */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "#1E293B", border: "1px solid #334155" }}>
          <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: "#334155" }}>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <p className="text-sm font-bold text-white">Biaya Platform</p>
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Biaya layanan yang dikenakan ke perusahaan · Berlaku seragam untuk semua jenis kontrak
            </p>
          </div>

          <div className="px-4 py-5 space-y-4">
            {/* Flat-rate callout */}
            <div
              className="rounded-xl px-4 py-4 flex items-center justify-between"
              style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)" }}
            >
              <div>
                <p className="text-xs text-slate-400">Biaya Sistem Rekhastha</p>
                <p className="text-2xl font-black text-emerald-400 mt-0.5">{(PLATFORM_FEE_CEPAT * 100).toFixed(0)}%</p>
                <p className="text-[10px] text-slate-500 mt-0.5">dari nominal gaji · beban perusahaan</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-400">Contoh: Rp 500.000 / shift</p>
                <p className="text-sm font-bold text-white mt-0.5">{fmt(500_000 * PLATFORM_FEE_CEPAT)}</p>
                <p className="text-[10px] text-slate-500">biaya per shift</p>
              </div>
            </div>

            {/* What the fee covers */}
            <div className="space-y-2">
              {[
                { label: "Escrow & perlindungan pembayaran", color: "#10B981" },
                { label: "Verifikasi identitas & anti-penipuan", color: "#10B981" },
                { label: "Mediasi sengketa & dukungan 24 jam", color: "#10B981" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <ArrowUpRight className="w-3.5 h-3.5 shrink-0" style={{ color: item.color }} />
                  <p className="text-[11px] text-slate-400">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Per-job table */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "#1E293B", border: "1px solid #334155" }}>
          <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: "#334155" }}>
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-blue-400" />
              <p className="text-sm font-bold text-white">Rincian Per Lowongan</p>
            </div>
          </div>

          {customJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "#0F172A" }}>
                <Briefcase className="w-6 h-6 text-slate-500" />
              </div>
              <p className="text-sm text-slate-500 font-medium">Belum ada lowongan aktif</p>
              <p className="text-xs text-slate-600">Buat lowongan baru untuk melihat analitik</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "#334155" }}>
              {jobBreakdowns.map(({ job, gross, comm, workerPay, rate }) => {
                const durasiLabel = durasiKontrakOptions.find((o) => o.value === (job.durasiKontrak ?? "harian"))?.label?.split(" ")[0] ?? "Harian";
                return (
                  <div key={job.id} className="px-4 py-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-bold text-white truncate">{job.posisi}</p>
                          {job.isAgency && (
                            <span
                              className="text-[9px] font-black px-1.5 py-0.5 rounded"
                              style={{ background: "rgba(59,130,246,0.2)", color: "#60A5FA", border: "1px solid rgba(59,130,246,0.3)" }}
                            >
                              AGENCY JOB
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {durasiLabel} · {job.kuota} org · {(rate * 100).toFixed(1)}% komisi
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-white">{fmt(gross)}</p>
                        <p className="text-[10px]" style={{ color: "#EF4444" }}>−{fmt(comm)} komisi</p>
                      </div>
                    </div>

                    {/* Mini bar */}
                    <div className="mt-2 flex gap-0.5 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="rounded-full"
                        style={{ width: `${((workerPay / gross) * 100).toFixed(0)}%`, background: "#10B981" }}
                      />
                      <div
                        className="flex-1 rounded-full"
                        style={{ background: "#EF4444", opacity: 0.7 }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[9px] text-emerald-500">Pekerja: {fmt(workerPay)}</span>
                      <span className="text-[9px]" style={{ color: "#F87171" }}>Platform: {fmt(comm)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Ratings list */}
        {ratings.length > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ background: "#1E293B", border: "1px solid #334155" }}>
            <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: "#334155" }}>
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                <p className="text-sm font-bold text-white">Riwayat Rating Pekerja</p>
              </div>
            </div>
            <div className="divide-y" style={{ borderColor: "#334155" }}>
              {ratings.filter(r => r.raterType === "company").slice(0, 5).map((r, i) => (
                <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{r.targetName}</p>
                    {r.comment && <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[180px]">{r.comment}</p>}
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    {[1,2,3,4,5].map((s) => (
                      <Star key={s} className={`w-3.5 h-3.5 ${s <= r.stars ? "fill-amber-400 text-amber-400" : "text-slate-600 fill-slate-700"}`} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Security notice */}
        <div
          className="flex items-start gap-3 rounded-xl px-4 py-3"
          style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)" }}
        >
          <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Semua transaksi dilindungi oleh sistem escrow dan anti-penipuan Rekhastha.
            Data diperbarui secara <span className="text-emerald-400 font-semibold">real-time</span> setiap transaksi baru.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Metric card ─────────────────────────────────────────────────────
const ACCENTS: Record<string, { bg: string; text: string; icon: string }> = {
  emerald: { bg: "rgba(16,185,129,0.1)",  text: "#10B981", icon: "rgba(16,185,129,0.2)" },
  blue:    { bg: "rgba(59,130,246,0.1)",  text: "#60A5FA", icon: "rgba(59,130,246,0.2)" },
  amber:   { bg: "rgba(245,158,11,0.1)",  text: "#FCD34D", icon: "rgba(245,158,11,0.2)" },
  violet:  { bg: "rgba(139,92,246,0.1)",  text: "#A78BFA", icon: "rgba(139,92,246,0.2)" },
};

function MetricCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: string; sub: string; accent: string;
}) {
  const a = ACCENTS[accent] ?? ACCENTS.emerald;
  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-2"
      style={{ background: "#1E293B", border: "1px solid #334155" }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: a.icon }}>
          <span style={{ color: a.text }}>{icon}</span>
        </div>
      </div>
      <p className="text-lg font-black leading-tight" style={{ color: a.text }}>{value}</p>
      <p className="text-[10px] text-slate-500">{sub}</p>
    </div>
  );
}
