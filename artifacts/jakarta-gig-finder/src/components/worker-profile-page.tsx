import { useState } from "react";
import { ShieldCheck, AlertCircle, Star, LogOut, Zap, TrendingUp, Clock, Banknote, Award, Play, Wallet } from "lucide-react";
import { AuthUser } from "@/types/auth";
import { WorkerProfile } from "@/types/worker-profile";
import { RatingPayload } from "@/components/rating-modal";
import { ApplicationNotification } from "@/types/notification";
import { WalletTransaction, EscrowEvent } from "@/types/escrow";
import EscrowWalletPanel from "@/components/escrow-wallet-panel";
import EscrowTimeline from "@/components/escrow-timeline";

interface WorkerProfilePageProps {
  currentUser: AuthUser;
  workerProfile: WorkerProfile | null;
  reputationPoints: number;
  ratings: RatingPayload[];
  completedJobs: ApplicationNotification[];
  totalEarned: number;
  clockedInAt: Date | null;
  clockedOutAt: Date | null;
  walletBalance: number;
  walletTransactions: WalletTransaction[];
  isWithdrawLocked: boolean;
  escrowEvents: EscrowEvent[];
  workerJobIds: number[];
  onLogout: () => void;
  onDemoInject: () => void;
  onEditProfile: () => void;
  onWithdraw: (method: string, account: string) => void;
}

type ProfileTab = "data" | "analitik" | "wallet";

function fmt(n: number) { return "Rp " + Math.round(n).toLocaleString("id-ID"); }
function maskNik(nik: string) { return nik.length >= 8 ? nik.slice(0, 4) + "••••••••" + nik.slice(-4) : nik; }
function maskNpwp(npwp: string) { return npwp.length >= 4 ? "••••••" + npwp.slice(-4) : npwp; }

export default function WorkerProfilePage({
  currentUser, workerProfile, reputationPoints, ratings,
  completedJobs, totalEarned, walletBalance, walletTransactions,
  isWithdrawLocked, escrowEvents, workerJobIds, onLogout, onDemoInject, onEditProfile, onWithdraw,
}: WorkerProfilePageProps) {
  const [tab, setTab] = useState<ProfileTab>("data");

  const hasNpwp = currentUser.hasNpwp || (workerProfile && !workerProfile.belumPunyaNpwp && workerProfile.npwp.length >= 15);
  const workerRatings = ratings.filter((r) => r.raterType === "company");
  const avgRating = workerRatings.length ? workerRatings.reduce((s, r) => s + r.stars, 0) / workerRatings.length : 0;
  const totalHours = completedJobs.length * 8;
  const netEarned = totalEarned;

  const initials = currentUser.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      {/* ── Profile header ──────────────────────────────── */}
      <div
        className="px-5 pt-6 pb-5 flex flex-col items-center gap-3"
        style={{ background: "linear-gradient(160deg, #065F46, #059669 80%, #10B981)" }}
      >
        <div className="relative">
          {currentUser.googleAvatar ? (
            <img src={currentUser.googleAvatar} alt={currentUser.name}
              className="w-20 h-20 rounded-full border-4 border-white shadow-lg object-cover" />
          ) : (
            <div className="w-20 h-20 rounded-full border-4 border-white shadow-lg bg-emerald-400 flex items-center justify-center">
              <span className="text-2xl font-black text-white">{initials}</span>
            </div>
          )}
          {currentUser.linkedWithGoogle && (
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-white flex items-center justify-center shadow-md">
              <svg width="14" height="14" viewBox="0 0 48 48">
                <path d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" fill="#FFC107"/>
                <path d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" fill="#FF3D00"/>
                <path d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" fill="#4CAF50"/>
                <path d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" fill="#1976D2"/>
              </svg>
            </div>
          )}
        </div>

        <div className="text-center">
          <h2 className="text-xl font-black text-white">{currentUser.name}</h2>
          <p className="text-sm text-emerald-100">{currentUser.email}</p>
          <div className="flex items-center justify-center gap-2 mt-1.5 flex-wrap">
            {currentUser.linkedWithGoogle && (
              <span className="text-[10px] font-bold bg-white/20 text-white px-2.5 py-1 rounded-full">🔗 Linked with Google</span>
            )}
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${reputationPoints >= 80 ? "bg-white/20 text-white" : reputationPoints >= 50 ? "bg-amber-400/30 text-amber-100" : "bg-red-400/30 text-red-100"}`}>
              Rep: {reputationPoints}/100
            </span>
          </div>
        </div>

        {/* Escrow guarantee badge */}
        <div className="flex items-center gap-2 bg-white/20 border border-white/30 rounded-xl px-4 py-2">
          <ShieldCheck className="w-4 h-4 text-emerald-200" />
          <span className="text-xs font-semibold text-white">Escrow Terjamin · Bebas Pajak Platform</span>
        </div>
      </div>

      {/* ── Tab bar ─────────────────────────────────────── */}
      <div className="flex bg-white border-b border-gray-100 px-3 gap-0.5">
        {(["data", "analitik", "wallet"] as ProfileTab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-3 text-xs font-bold transition-all border-b-2 flex items-center justify-center gap-1 ${tab === t ? "border-emerald-600 text-emerald-700" : "border-transparent text-gray-500"}`}>
            {t === "data" ? "📋 Data Diri" : t === "analitik" ? "📊 Analitik" : <><Wallet className="w-3.5 h-3.5" /> E-Wallet</>}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-4 pb-24">
        {tab === "data" ? (
          /* ── DATA DIRI ─────────────────────────────────── */
          <>
            {workerProfile ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-900">Identitas Legal KTP</p>
                  <button onClick={onEditProfile} className="text-xs font-semibold text-emerald-600">Edit</button>
                </div>
                <div className="divide-y divide-gray-50">
                  <DataRow label="Nama Lengkap (KTP)" value={workerProfile.namaLengkap} />
                  <DataRow label="NIK (16 Digit)" value={maskNik(workerProfile.nik)} badge={workerProfile.nik.length === 16 ? { text: "Valid", color: "green" } : undefined} />
                  <DataRow label="NPWP"
                    value={workerProfile.belumPunyaNpwp ? "Belum memiliki NPWP" : maskNpwp(workerProfile.npwp)}
                    badge={workerProfile.belumPunyaNpwp ? { text: "Tanpa NPWP", color: "amber" } : { text: "Terverifikasi", color: "green" }}
                  />
                  <DataRow label="Tempat, Tgl Lahir" value={`${workerProfile.tempatLahir}, ${workerProfile.tanggalLahir}`} />
                  <DataRow label="Jenis Kelamin" value={workerProfile.jenisKelamin === "L" ? "Laki-laki" : "Perempuan"} />
                  <DataRow label="WhatsApp" value={workerProfile.whatsapp} />
                </div>
              </div>
            ) : (
              <button onClick={onEditProfile}
                className="w-full flex flex-col items-center gap-3 bg-white border-2 border-dashed border-emerald-200 rounded-2xl py-8 hover:bg-emerald-50 transition-colors">
                <ShieldCheck className="w-10 h-10 text-emerald-300" />
                <div className="text-center">
                  <p className="text-sm font-bold text-gray-700">Lengkapi Data Diri Legal</p>
                  <p className="text-xs text-gray-500 mt-0.5">KTP, NIK, NPWP wajib untuk mulai bekerja</p>
                </div>
                <span className="bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-full">Lengkapi Sekarang</span>
              </button>
            )}

            {workerProfile && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50">
                  <p className="text-sm font-bold text-gray-900">Rekening Pembayaran</p>
                </div>
                <div className="divide-y divide-gray-50">
                  <DataRow label="Bank / E-Wallet" value={workerProfile.namaBank || "—"} />
                  <DataRow label="No. Rekening" value={workerProfile.nomorRekening ? "••••••" + workerProfile.nomorRekening.slice(-4) : "—"} />
                  <DataRow label="Atas Nama" value={workerProfile.namaRekening || "—"} />
                </div>
              </div>
            )}

            {/* Demo inject */}
            <button onClick={onDemoInject}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-violet-200 bg-violet-50 text-violet-700 text-sm font-bold py-3.5 rounded-2xl hover:bg-violet-100 transition-colors">
              <Play className="w-4 h-4" /> 🚀 Suntik 20 Data Simulasi (Mode Demo)
            </button>
          </>

        ) : tab === "analitik" ? (
          /* ── ANALITIK ──────────────────────────────────── */
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              <WorkerMetricCard icon={<Clock className="w-4 h-4" />} label="Total Jam Kerja" value={`${totalHours} Jam`} sub={`${completedJobs.length} proyek selesai`} color="emerald" />
              <WorkerMetricCard icon={<Banknote className="w-4 h-4" />} label="Pendapatan Bersih" value={completedJobs.length ? fmt(netEarned) : "—"} sub="100% utuh tanpa potongan" color="blue" />
              <WorkerMetricCard icon={<Star className="w-4 h-4 fill-amber-400" />} label="Rating Rata-Rata" value={avgRating ? avgRating.toFixed(1) + " ★" : "—"} sub={`${workerRatings.length} ulasan`} color="amber" />
              <WorkerMetricCard icon={<Award className="w-4 h-4" />} label="Skor Reputasi" value={`${reputationPoints}/100`} sub={reputationPoints >= 80 ? "Terpercaya" : reputationPoints >= 50 ? "Perlu Perhatian" : "Ditangguhkan"} color={reputationPoints >= 80 ? "emerald" : reputationPoints >= 50 ? "amber" : "red"} />
            </div>

            {/* Reputation bar */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-900">Poin Reputasi</p>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${reputationPoints >= 80 ? "bg-emerald-100 text-emerald-700" : reputationPoints >= 50 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600"}`}>
                  {reputationPoints >= 80 ? "Baik" : reputationPoints >= 50 ? "Waspada" : "Suspended"}
                </span>
              </div>
              <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${reputationPoints}%`,
                    background: reputationPoints >= 80 ? "linear-gradient(90deg,#065F46,#10B981)" : reputationPoints >= 50 ? "linear-gradient(90deg,#D97706,#FBBF24)" : "linear-gradient(90deg,#DC2626,#EF4444)",
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>0 — Ditangguhkan</span>
                <span>50 — Minimum</span>
                <span>100 — Sempurna</span>
              </div>
              <p className="text-[11px] text-gray-500">Setiap pembatalan pekerjaan −20 poin. Di bawah 50 akun ditangguhkan otomatis.</p>
            </div>

            {/* Rating history */}
            {workerRatings.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50">
                  <p className="text-sm font-bold text-gray-900">Riwayat Penilaian</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {workerRatings.slice(0, 5).map((r, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{r.targetName}</p>
                        {r.comment && <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{r.comment}</p>}
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        {[1,2,3,4,5].map((s) => (
                          <Star key={s} className={`w-3.5 h-3.5 ${s <= r.stars ? "fill-amber-400 text-amber-400" : "text-gray-200 fill-gray-100"}`} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* E-wallet breakdown */}
            {completedJobs.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4 space-y-3">
                <p className="text-sm font-bold text-gray-900">Estimasi E-Wallet</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-gray-600"><span>Total Upah Pekerjaan Selesai</span><span className="font-semibold text-gray-900">{fmt(totalEarned)}</span></div>
                  <div className="flex justify-between text-gray-600"><span>Potongan Platform</span><span className="font-semibold text-emerald-600">Rp 0 (0%)</span></div>
                  <div className="flex justify-between text-gray-700 border-t border-gray-100 pt-2"><span className="font-bold">Bersih Diterima (100%)</span><span className="font-black text-emerald-600">{fmt(netEarned)}</span></div>
                </div>
                <p className="text-[10px] text-gray-400 leading-relaxed">Segala kewajiban perpajakan menjadi tanggung jawab mandiri masing-masing pihak sesuai hukum yang berlaku.</p>
              </div>
            )}

            <button onClick={onDemoInject}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-violet-200 bg-violet-50 text-violet-700 text-sm font-bold py-3.5 rounded-2xl hover:bg-violet-100 transition-colors">
              <Play className="w-4 h-4" /> 🚀 Suntik Data Demo untuk Presentasi
            </button>
          </>
        ) : tab === "wallet" ? (
          /* ── E-WALLET ──────────────────────────────────── */
          <>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-sm font-black text-emerald-800 leading-snug">
                🟢 Jaminan Rekhastha: Upah Anda dicairkan 100% utuh tanpa potongan sepeser pun (Bebas Biaya Admin via 15% Employer Markup)
              </p>
            </div>
            <EscrowWalletPanel
              balance={walletBalance}
              transactions={walletTransactions}
              isWithdrawLocked={isWithdrawLocked}
              onWithdraw={onWithdraw}
            />

            {/* Escrow audit log — only jobs this worker participated in */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs font-black text-gray-900">Riwayat Escrow Saya</p>
                  <p className="text-[10px] text-gray-400">Jejak dana dari setiap pekerjaan</p>
                </div>
              </div>
              <div className="p-4">
                <EscrowTimeline
                  events={escrowEvents}
                  filterJobIds={workerJobIds.length > 0 ? workerJobIds : undefined}
                  emptyLabel="Selesaikan pekerjaan pertama untuk melihat riwayat escrow"
                />
              </div>
            </div>
          </>
        ) : null}

        {/* Logout */}
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 bg-red-50 border border-red-200 text-red-500 text-sm font-semibold py-3 rounded-2xl hover:bg-red-100 transition-colors mt-2"
        >
          <LogOut className="w-4 h-4" /> Keluar dari Akun
        </button>
      </div>
    </div>
  );
}

function DataRow({ label, value, badge }: { label: string; value: string; badge?: { text: string; color: "green" | "amber" | "red" } }) {
  const badgeStyle = badge?.color === "green" ? "bg-emerald-100 text-emerald-700"
    : badge?.color === "amber" ? "bg-amber-100 text-amber-700"
    : "bg-red-100 text-red-600";
  return (
    <div className="px-4 py-3 flex items-center justify-between gap-3">
      <p className="text-xs text-gray-500 shrink-0">{label}</p>
      <div className="flex items-center gap-2 min-w-0">
        <p className="text-sm font-semibold text-gray-800 text-right truncate">{value}</p>
        {badge && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${badgeStyle}`}>{badge.text}</span>}
      </div>
    </div>
  );
}

const COLOR_MAP: Record<string, { bg: string; text: string; icon: string }> = {
  emerald: { bg: "bg-emerald-50", text: "text-emerald-700", icon: "bg-emerald-100 text-emerald-600" },
  blue:    { bg: "bg-blue-50",    text: "text-blue-700",    icon: "bg-blue-100 text-blue-600" },
  amber:   { bg: "bg-amber-50",   text: "text-amber-700",   icon: "bg-amber-100 text-amber-600" },
  red:     { bg: "bg-red-50",     text: "text-red-600",     icon: "bg-red-100 text-red-500" },
};

function WorkerMetricCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: string }) {
  const c = COLOR_MAP[color] ?? COLOR_MAP.emerald;
  return (
    <div className={`${c.bg} rounded-2xl p-4 flex flex-col gap-2`}>
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${c.icon}`}>{icon}</div>
      <p className={`text-lg font-black leading-tight ${c.text}`}>{value}</p>
      <div>
        <p className="text-xs font-semibold text-gray-700">{label}</p>
        <p className="text-[10px] text-gray-500">{sub}</p>
      </div>
    </div>
  );
}
