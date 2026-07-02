import { useState } from "react";
import { ShieldCheck, LogOut, Building2, Play, BarChart2, Lock, AlertTriangle, Gavel, CheckCircle, RefreshCcw, History } from "lucide-react";
import { AuthUser } from "@/types/auth";
import { CustomJob } from "@/types/custom-job";
import { RatingPayload } from "@/components/rating-modal";
import { ApplicationNotification } from "@/types/notification";
import AnalyticsDashboard from "@/components/analytics-dashboard";
import EscrowTimeline from "@/components/escrow-timeline";
import { EscrowEvent } from "@/types/escrow";

interface CompanyProfilePageProps {
  currentUser: AuthUser;
  customJobs: CustomJob[];
  ratings: RatingPayload[];
  notifications: ApplicationNotification[];
  onLogout: () => void;
  onDemoInject: () => void;
  escrowEvents: EscrowEvent[];
  onDispute: (jobId: number) => void;
  onAdminResolve: (jobId: number, winner: "worker" | "company") => void;
}

type ProfileTab = "data" | "analitik" | "riwayat";

export default function CompanyProfilePage({
  currentUser, customJobs, ratings, notifications, escrowEvents, onLogout, onDemoInject, onDispute, onAdminResolve,
}: CompanyProfilePageProps) {
  const [tab, setTab] = useState<ProfileTab>("data");
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const nibValid = (currentUser.nibPerusahaan?.length ?? 0) === 13;

  const lockedJobs = customJobs.filter(j => j.escrowStatus === "locked" || j.escrowStatus === "disputed");
  const disputedJobs = customJobs.filter(j => j.escrowStatus === "disputed");
  const escrowFloat = lockedJobs.reduce((s, j) => s + (j.escrowAmount ?? 0), 0);
  const fmt = (n: number) => "Rp " + Math.round(n).toLocaleString("id-ID");

  const initials = currentUser.name.split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: tab === "analitik" ? "#0F172A" : "#F8FAFC" }}>

      {/* ── Profile header ──────────────────────────────── */}
      <div
        className="px-5 pt-6 pb-5 flex flex-col items-center gap-3"
        style={{ background: "linear-gradient(160deg, #1E3A5F 0%, #1D4ED8 60%, #3B82F6 100%)" }}
      >
        <div className="w-20 h-20 rounded-full border-4 border-white shadow-lg flex items-center justify-center"
          style={{ background: "linear-gradient(135deg,#2563EB,#7C3AED)" }}>
          <span className="text-2xl font-black text-white">{initials}</span>
        </div>
        <div className="text-center">
          <h2 className="text-xl font-black text-white">{currentUser.namaPerusahaan || currentUser.name}</h2>
          <p className="text-sm text-blue-100">{currentUser.email}</p>
          <div className="flex items-center justify-center gap-2 mt-1.5 flex-wrap">
            {currentUser.linkedWithGoogle && (
              <span className="text-[10px] font-bold bg-white/20 text-white px-2.5 py-1 rounded-full">🔗 Linked with Google</span>
            )}
            <span className="text-[10px] font-bold bg-white/20 text-white px-2.5 py-1 rounded-full">
              {currentUser.tipeAkun === "agensi" ? "🏢 Agensi / EO" : "🏪 Perusahaan Langsung"}
            </span>
          </div>
        </div>

        {nibValid ? (
          <div className="flex items-center gap-2 bg-white/20 border border-white/30 rounded-xl px-4 py-2">
            <ShieldCheck className="w-4 h-4 text-blue-200" />
            <span className="text-xs font-semibold text-white">NIB Terverifikasi — Bisnis Legal</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-amber-400/20 border border-amber-300/40 rounded-xl px-4 py-2">
            <ShieldCheck className="w-4 h-4 text-amber-200" />
            <span className="text-xs font-semibold text-amber-100">NIB belum diisi — Lengkapi data bisnis</span>
          </div>
        )}
      </div>

      {/* ── Tab bar ─────────────────────────────────────── */}
      <div className={`flex border-b px-5 gap-1 ${tab === "analitik" ? "bg-slate-900 border-slate-700" : "bg-white border-gray-100"}`}>
        {(["data", "analitik", "riwayat"] as ProfileTab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-3 text-xs font-bold transition-all border-b-2 ${
              tab === t
                ? t === "analitik" ? "border-emerald-400 text-emerald-400" : "border-blue-600 text-blue-700"
                : tab === "analitik" ? "border-transparent text-slate-500" : "border-transparent text-gray-500"
            }`}>
            {t === "data" ? "🏢 Bisnis" : t === "analitik" ? "📊 Analitik" : "📋 Riwayat"}
          </button>
        ))}
      </div>

      {tab === "data" ? (
        <div className="p-4 space-y-4 pb-24">

          {/* ── Escrow Float Card ────────────────────── */}
          {escrowFloat > 0 && (
            <div className="rounded-2xl overflow-hidden border border-blue-200"
              style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #1D4ED8 100%)" }}>
              <div className="px-4 py-4">
                <div className="flex items-center gap-2 mb-1">
                  <Lock className="w-4 h-4 text-blue-200" />
                  <p className="text-xs font-semibold text-blue-200 uppercase tracking-wide">Total Dana Mengendap di Escrow</p>
                </div>
                <p className="text-2xl font-black text-white mb-3">{fmt(escrowFloat)}</p>
                <div className="flex gap-3">
                  <div className="flex-1 bg-white/10 rounded-xl p-2.5 text-center">
                    <p className="text-sm font-black text-white">{lockedJobs.filter(j => j.escrowStatus === "locked").length}</p>
                    <p className="text-[9px] text-blue-200">Dana Dikunci</p>
                  </div>
                  <div className="flex-1 bg-white/10 rounded-xl p-2.5 text-center">
                    <p className="text-sm font-black text-white">{disputedJobs.length}</p>
                    <p className="text-[9px] text-blue-200">Dana Dibekukan</p>
                  </div>
                  <div className="flex-1 bg-white/10 rounded-xl p-2.5 text-center">
                    <p className="text-sm font-black text-white">{customJobs.filter(j => j.escrowStatus === "released").length}</p>
                    <p className="text-[9px] text-blue-200">Dilepas</p>
                  </div>
                </div>
              </div>
              {disputedJobs.length > 0 && (
                <div className="bg-red-600/90 px-4 py-2.5 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-white shrink-0" />
                  <p className="text-xs text-white font-bold">{disputedJobs.length} sengketa aktif — dana dibekukan oleh sistem</p>
                </div>
              )}
            </div>
          )}

          {/* ── Active Escrow Jobs ───────────────────── */}
          {lockedJobs.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
                <Lock className="w-4 h-4 text-blue-600" />
                <p className="text-sm font-bold text-gray-900">Lowongan Aktif (Escrow)</p>
              </div>
              <div className="divide-y divide-gray-50">
                {lockedJobs.map(job => {
                  const isDisputed = job.escrowStatus === "disputed";
                  return (
                    <div key={job.id} className="px-4 py-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate">{job.posisi}</p>
                          <p className="text-xs text-gray-500">Escrow: {fmt(job.escrowAmount ?? 0)}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${isDisputed ? "bg-red-100 text-red-700 animate-pulse" : "bg-blue-100 text-blue-700"}`}>
                          {isDisputed ? "🔴 DIBEKUKAN" : "🔒 DIKUNCI"}
                        </span>
                      </div>
                      {!isDisputed && (
                        <button onClick={() => onDispute(job.id)}
                          className="w-full flex items-center justify-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold py-2 rounded-xl hover:bg-amber-100 transition-colors">
                          <AlertTriangle className="w-3.5 h-3.5" /> Ajukan Pengaduan Kelalaian
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Legal data */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-600" />
              <p className="text-sm font-bold text-gray-900">Profil Bisnis</p>
            </div>
            <div className="divide-y divide-gray-50">
              <DataRow label="Nama Bisnis" value={currentUser.namaPerusahaan || currentUser.name} />
              <DataRow label="Tipe Bisnis" value={currentUser.tipeAkun === "agensi" ? "Agensi / Event Organizer / Outsourcing" : "Perusahaan Langsung (Kafe, Resto, Hotel, dll)"} />
              <DataRow label="Nomor Induk Berusaha (NIB)"
                value={currentUser.nibPerusahaan ? "••••••••" + currentUser.nibPerusahaan.slice(-5) : "Belum diisi"}
                badge={nibValid ? { text: "Valid", color: "green" } : { text: "Tidak Valid", color: "amber" }}
              />
              <DataRow label="Email" value={currentUser.email} />
              {currentUser.whatsapp && <DataRow label="WhatsApp" value={currentUser.whatsapp} />}
            </div>
          </div>

          {/* Stats summary */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Lowongan Aktif", value: String(customJobs.length), color: "bg-blue-50 text-blue-700" },
              { label: "Total Pelamar", value: String(notifications.length), color: "bg-violet-50 text-violet-700" },
              { label: "Rating Rata-rata", value: ratings.filter(r => r.raterType === "company").length ? (ratings.filter(r => r.raterType === "company").reduce((s, r) => s + r.stars, 0) / ratings.filter(r => r.raterType === "company").length).toFixed(1) + " ★" : "—", color: "bg-amber-50 text-amber-700" },
            ].map((s) => (
              <div key={s.label} className={`${s.color} rounded-2xl p-3 text-center`}>
                <p className="text-xl font-black">{s.value}</p>
                <p className="text-[10px] font-semibold mt-0.5 leading-tight">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Demo inject */}
          <button onClick={onDemoInject}
            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-violet-200 bg-violet-50 text-violet-700 text-sm font-bold py-3.5 rounded-2xl hover:bg-violet-100 transition-colors">
            <Play className="w-4 h-4" /> 🚀 Suntik 20 Data Simulasi (Mode Demo)
          </button>

          {/* Switch to analytics CTA */}
          <button onClick={() => setTab("analitik")}
            className="w-full flex items-center justify-center gap-2 bg-slate-900 text-emerald-400 text-sm font-bold py-3.5 rounded-2xl hover:bg-slate-800 transition-colors">
            <BarChart2 className="w-4 h-4" /> Lihat Dashboard Analitik Keuangan →
          </button>

          {/* ── Admin Escrow Key Panel ───────────────── */}
          <button onClick={() => setShowAdminPanel(p => !p)}
            className="w-full flex items-center justify-center gap-2 bg-gray-900 text-amber-400 text-xs font-bold py-3 rounded-2xl hover:bg-gray-800 transition-colors border border-amber-900/30">
            <Gavel className="w-3.5 h-3.5" /> 🔑 Admin Master Escrow Key {showAdminPanel ? "▲" : "▼"}
          </button>

          {showAdminPanel && (
            <div className="bg-gray-900 rounded-2xl border border-amber-700/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-amber-700/20 flex items-center gap-2">
                <Gavel className="w-4 h-4 text-amber-400" />
                <p className="text-sm font-bold text-amber-400">Admin Escrow Command Center</p>
              </div>
              {disputedJobs.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm text-gray-500">Tidak ada sengketa aktif</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-800">
                  {disputedJobs.map(job => (
                    <div key={job.id} className="px-4 py-4 space-y-3">
                      <div>
                        <p className="text-sm font-bold text-white">{job.posisi}</p>
                        <p className="text-xs text-gray-400">Dana dibekukan: {fmt(job.escrowAmount ?? 0)}</p>
                        <p className="text-[10px] text-red-400 mt-0.5">🔴 DANA DIBEKUKAN — INVESTIGASI ADMIN</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => onAdminResolve(job.id, "worker")}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 text-white text-xs font-bold py-2.5 rounded-xl hover:bg-emerald-500 transition-colors">
                          <CheckCircle className="w-3.5 h-3.5" /> Menangkan Pekerja
                        </button>
                        <button onClick={() => onAdminResolve(job.id, "company")}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-blue-700 text-white text-xs font-bold py-2.5 rounded-xl hover:bg-blue-600 transition-colors">
                          <RefreshCcw className="w-3.5 h-3.5" /> Refund ke Perusahaan
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-500 text-center">Menangkan pekerja → gaji dilepas (potong komisi 10%). Refund → dikembalikan (potong 5% biaya admin).</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <button onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 bg-red-50 border border-red-200 text-red-500 text-sm font-semibold py-3 rounded-2xl hover:bg-red-100 transition-colors">
            <LogOut className="w-4 h-4" /> Keluar dari Akun
          </button>
        </div>

      ) : tab === "analitik" ? (
        /* Analytics — reuses dark AnalyticsDashboard + logout at bottom */
        <div className="flex flex-col" style={{ background: "#0F172A" }}>
          <AnalyticsDashboard customJobs={customJobs} ratings={ratings} totalApplicants={notifications.length} />
          <div className="px-4 pb-10 space-y-3" style={{ background: "#0F172A" }}>
            <button onClick={onDemoInject}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-violet-500/40 text-violet-400 text-sm font-bold py-3.5 rounded-2xl hover:bg-violet-900/20 transition-colors">
              <Play className="w-4 h-4" /> 🚀 Suntik Data Demo untuk Presentasi
            </button>
            <button onClick={onLogout}
              className="w-full flex items-center justify-center gap-2 border border-red-800 text-red-400 text-sm font-semibold py-3 rounded-2xl hover:bg-red-900/20 transition-colors">
              <LogOut className="w-4 h-4" /> Keluar dari Akun
            </button>
          </div>
        </div>

      ) : (
        /* ── Riwayat Escrow / Audit Log ──────────────── */
        <div className="p-4 space-y-4 pb-24">
          {/* Header card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <History className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-black text-gray-900">Audit Log Escrow Rekhastha</p>
                <p className="text-xs text-gray-500">Setiap perubahan status dana tercatat permanen & tidak dapat diubah</p>
              </div>
            </div>

            {/* Summary chips */}
            {escrowEvents.length > 0 && (
              <div className="flex gap-2 mt-3 flex-wrap">
                {(["locked","disputed","released","refunded"] as const).map(s => {
                  const count = escrowEvents.filter(e => e.toStatus === s).length;
                  if (!count) return null;
                  const colors: Record<string, string> = {
                    locked: "bg-blue-50 text-blue-700 border-blue-200",
                    disputed: "bg-red-50 text-red-700 border-red-200",
                    released: "bg-emerald-50 text-emerald-700 border-emerald-200",
                    refunded: "bg-gray-100 text-gray-700 border-gray-200",
                  };
                  const labels: Record<string, string> = { locked: "🔒 Dikunci", disputed: "⚠️ Sengketa", released: "✅ Dilepas", refunded: "↩️ Refund" };
                  return (
                    <span key={s} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${colors[s]}`}>
                      {labels[s]} ×{count}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {/* Timeline */}
          <EscrowTimeline events={escrowEvents} />

          <button onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 bg-red-50 border border-red-200 text-red-500 text-sm font-semibold py-3 rounded-2xl hover:bg-red-100 transition-colors">
            <LogOut className="w-4 h-4" /> Keluar dari Akun
          </button>
        </div>
      )}
    </div>
  );
}

function DataRow({ label, value, badge }: { label: string; value: string; badge?: { text: string; color: "green" | "amber" | "red" } }) {
  const badgeStyle = badge?.color === "green" ? "bg-emerald-100 text-emerald-700" : badge?.color === "amber" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600";
  return (
    <div className="px-4 py-3 flex items-center justify-between gap-3">
      <p className="text-xs text-gray-500 shrink-0 max-w-[100px]">{label}</p>
      <div className="flex items-center gap-2 min-w-0">
        <p className="text-xs font-semibold text-gray-800 text-right">{value}</p>
        {badge && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${badgeStyle}`}>{badge.text}</span>}
      </div>
    </div>
  );
}
