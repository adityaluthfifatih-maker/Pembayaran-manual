import { Banknote, ArrowDownCircle, Lock, TrendingUp, Clock, CheckCircle, AlertTriangle } from "lucide-react";
import { WalletTransaction } from "@/types/escrow";

interface EscrowWalletPanelProps {
  balance: number;
  transactions: WalletTransaction[];
  isWithdrawLocked: boolean;
  hasNpwp: boolean;
  onWithdraw: () => void;
}

function fmt(n: number) { return "Rp " + Math.round(n).toLocaleString("id-ID"); }

function timeAgo(d: Date) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "Baru saja";
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

export default function EscrowWalletPanel({
  balance, transactions, isWithdrawLocked, hasNpwp, onWithdraw,
}: EscrowWalletPanelProps) {
  const credits = transactions.filter(t => t.type === "credit");
  const debits  = transactions.filter(t => t.type === "debit");
  const totalIn = credits.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-4">
      {/* ── E-Wallet Card ─────────────────────────── */}
      <div
        className="rounded-3xl p-5 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #065F46 0%, #0D9488 50%, #059669 100%)" }}
      >
        {/* Decorative circles */}
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/5" />
        <div className="absolute -bottom-4 -left-4 w-20 h-20 rounded-full bg-white/5" />

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                <Banknote className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-[10px] text-emerald-200 font-semibold uppercase tracking-wider">Rekhastha E-Wallet</p>
                <p className="text-[9px] text-emerald-300">{hasNpwp ? "✓ PPh 21 2.5% (NPWP)" : "⚠ PPh 21 3% (Tanpa NPWP)"}</p>
              </div>
            </div>
            {isWithdrawLocked && (
              <div className="flex items-center gap-1 bg-red-500/20 border border-red-400/30 rounded-full px-2 py-1">
                <Lock className="w-3 h-3 text-red-300" />
                <span className="text-[9px] text-red-300 font-bold">SENGKETA</span>
              </div>
            )}
          </div>

          <div className="mb-4">
            <p className="text-xs text-emerald-200 mb-1">Saldo Tersedia</p>
            <p className="text-3xl font-black text-white tracking-tight">{fmt(balance)}</p>
          </div>

          <div className="flex gap-3 text-center mb-4">
            <div className="flex-1 bg-white/10 rounded-2xl p-2.5">
              <p className="text-xs font-black text-white">{fmt(totalIn)}</p>
              <p className="text-[9px] text-emerald-200">Total Masuk</p>
            </div>
            <div className="flex-1 bg-white/10 rounded-2xl p-2.5">
              <p className="text-xs font-black text-white">{credits.length}</p>
              <p className="text-[9px] text-emerald-200">Transaksi</p>
            </div>
            <div className="flex-1 bg-white/10 rounded-2xl p-2.5">
              <p className="text-xs font-black text-white">{debits.length}</p>
              <p className="text-[9px] text-emerald-200">Penarikan</p>
            </div>
          </div>

          <button
            onClick={onWithdraw}
            disabled={isWithdrawLocked || balance <= 0}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] ${
              isWithdrawLocked || balance <= 0
                ? "bg-white/10 text-white/40 cursor-not-allowed"
                : "bg-white text-emerald-800 shadow-lg hover:bg-emerald-50"
            }`}
          >
            {isWithdrawLocked ? (
              <><Lock className="w-4 h-4" /> Penarikan Diblokir — Sengketa Aktif</>
            ) : (
              <><ArrowDownCircle className="w-4 h-4" /> Tarik Saldo ke Rekening Bank</>
            )}
          </button>
        </div>
      </div>

      {/* ── Insurance banner ─────────────────────── */}
      <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
        <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
          <CheckCircle className="w-4 h-4 text-blue-600" />
        </div>
        <div>
          <p className="text-xs font-bold text-blue-800">🔒 Gaji Terjamin di Escrow Rekhastha</p>
          <p className="text-[10px] text-blue-600 mt-0.5 leading-relaxed">
            Dana upah dikunci sebelum Anda bekerja. Asuransi Kecelakaan Kerja aktif selama Clock-In — Clock-Out oleh Rekhastha &amp; Pemprov DKI Jakarta.
          </p>
        </div>
      </div>

      {/* ── Transaction history ───────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <p className="text-sm font-bold text-gray-900">Riwayat Mutasi</p>
        </div>

        {transactions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center px-4">
            <Clock className="w-8 h-8 text-gray-200" />
            <p className="text-sm font-semibold text-gray-400">Belum ada transaksi</p>
            <p className="text-xs text-gray-400">Mutasi akan muncul setelah pekerjaan selesai dan dana dilepas dari escrow.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {transactions.slice().reverse().map((t) => (
              <div key={t.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${t.type === "credit" ? "bg-emerald-100" : "bg-red-100"}`}>
                    {t.type === "credit"
                      ? <ArrowDownCircle className="w-4 h-4 text-emerald-600" />
                      : <Banknote className="w-4 h-4 text-red-500" />
                    }
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{t.label}</p>
                    <p className="text-[10px] text-gray-400 truncate">{t.jobTitle} · {timeAgo(t.timestamp)}</p>
                    {t.note && <p className="text-[10px] text-gray-400 truncate">{t.note}</p>}
                  </div>
                </div>
                <p className={`text-sm font-black shrink-0 ${t.type === "credit" ? "text-emerald-600" : "text-red-500"}`}>
                  {t.type === "credit" ? "+" : "−"}{fmt(t.amount)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── PPh notice ───────────────────────────── */}
      <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-700 leading-relaxed">
          PPh 21 dipotong otomatis saat dana escrow dilepas: <strong>{hasNpwp ? "2.5%" : "3.0%"}</strong> dari upah bersih (setelah komisi platform 10%).
          {!hasNpwp && " Daftarkan NPWP untuk tarif lebih rendah."}
        </p>
      </div>
    </div>
  );
}
