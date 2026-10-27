import { AlertTriangle, Banknote, ArrowDownCircle, Lock, TrendingUp, Clock, CheckCircle, Wallet } from "lucide-react";
import { WalletTransaction } from "@/types/escrow";

interface EscrowWalletPanelProps {
  balance: number;
  transactions: WalletTransaction[];
  isWithdrawLocked: boolean;
  onWithdraw: (method: string, account: string) => void;
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
  balance, transactions, isWithdrawLocked, onWithdraw,
}: EscrowWalletPanelProps) {
  const credits = transactions.filter(t => t.type === "credit");
  const debits  = transactions.filter(t => t.type === "debit");
  const totalIn = credits.reduce((s, t) => s + t.amount, 0);

  const canWithdraw = !isWithdrawLocked && balance > 0;
  const handleSubmit = () => {
    if (canWithdraw) onWithdraw("Transfer Bank", "");
  };

  return (
    <div className="space-y-4">
      {/* ── E-Wallet Balance Card ─────────────────────────── */}
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
                <p className="text-[9px] text-emerald-300">✓ Escrow Terjamin · Bebas Pajak Platform</p>
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

          <div className="flex gap-3 text-center">
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
        </div>
      </div>

      {/* ── Dompet Rekhastha (Pencairan Upah) — withdrawal form ─────── */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3.5 border-b border-gray-50 flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Wallet className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">Dompet Rekhastha</p>
            <p className="text-[10px] text-gray-400">Pencairan upah ditransfer dan dicatat admin</p>
          </div>
        </div>

        <div className="px-4 py-4 space-y-3.5">
          {/* Total saldo tersedia (disabled summary) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-700">Total Saldo Tersedia (Net 100% Bebas Potongan)</label>
            <div className="w-full border border-emerald-200 rounded-xl px-4 py-3 bg-emerald-50 flex items-center justify-between cursor-not-allowed">
              <span className="text-lg font-black text-emerald-700">{fmt(balance)}</span>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 rounded-full px-2 py-0.5">100% NET</span>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-gray-500">
            Permintaan memakai rekening bank yang tersimpan di profil. Admin akan mentransfer upah dan mencatat nomor referensinya; saldo baru dianggap cair setelah status diperbarui.
          </p>

          <button
            onClick={handleSubmit}
            disabled={!canWithdraw}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] ${
              canWithdraw
                ? "bg-primary text-white shadow-lg hover:bg-primary/90"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            {isWithdrawLocked ? (
              <><Lock className="w-4 h-4" /> Penarikan Diblokir — Sengketa Aktif</>
            ) : balance <= 0 ? (
              <>Saldo Belum Tersedia</>
            ) : (
              <><ArrowDownCircle className="w-4 h-4" /> Minta transfer {fmt(balance)}</>
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

      {/* ── Tax self-responsibility notice ───────────────────────────── */}
      <div className="flex items-start gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5">
        <AlertTriangle className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-600 leading-relaxed">
          Saat dana escrow dilepas, upah pekerja dicairkan 100% utuh tanpa potongan — biaya platform 15% sepenuhnya ditanggung perusahaan. Segala kewajiban perpajakan menjadi tanggung jawab mandiri masing-masing pihak sesuai hukum yang berlaku.
        </p>
      </div>
    </div>
  );
}
