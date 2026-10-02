import { useCallback, useEffect, useState } from "react";
import { Banknote, CheckCircle2, Clock3, Copy, Loader2, RefreshCw, X } from "lucide-react";

type ManualPayment = {
  id: number;
  targetType: string;
  targetId: string;
  amount: number;
  status: string;
  transferReference: string | null;
  proofNote: string | null;
  adminNote: string | null;
  createdAt: string;
};

type TransferInstructions = {
  bankName: string;
  accountName: string;
  accountNumber: string;
  instructions: string;
} | null;

const TYPE_LABELS: Record<string, string> = {
  gig_escrow: "Pendanaan upah lowongan",
  instant_listing: "Biaya Instan Kilat",
  legacy_subscription: "Paket Bulanan",
  business_subscription: "Rekhastha Bisnis",
  project_escrow: "Pendanaan proyek",
};

const STATUS_LABELS: Record<string, string> = {
  awaiting_payment: "Menunggu transfer",
  under_review: "Sedang ditinjau admin",
  confirmed: "Pembayaran dikonfirmasi",
  rejected: "Perlu dikirim ulang",
};

function formatRp(amount: number) {
  return `Rp ${Math.round(amount).toLocaleString("id-ID")}`;
}

export default function ManualPaymentsPanel({ onClose }: { onClose: () => void }) {
  const [payments, setPayments] = useState<ManualPayment[]>([]);
  const [instructions, setInstructions] = useState<TransferInstructions>(null);
  const [references, setReferences] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/manual-payments/mine", {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await response.json()) as {
        error?: string;
        payments?: ManualPayment[];
        instructions?: TransferInstructions;
      };
      if (!response.ok) throw new Error(data.error || "Tagihan tidak dapat dimuat.");
      setPayments(data.payments ?? []);
      setInstructions(data.instructions ?? null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat tagihan.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submitReference = async (paymentId: number) => {
    const transferReference = references[paymentId]?.trim() ?? "";
    if (transferReference.length < 3) return;
    setBusyId(paymentId);
    setError("");
    try {
      const response = await fetch(`/api/manual-payments/${paymentId}/submit`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transferReference,
          proofNote: notes[paymentId] ?? "",
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Referensi transfer gagal dikirim.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Referensi transfer gagal dikirim.");
    } finally {
      setBusyId(null);
    }
  };

  const copyAccount = async () => {
    if (!instructions?.accountNumber) return;
    try {
      await navigator.clipboard.writeText(instructions.accountNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Nomor rekening tidak dapat disalin di browser ini.");
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/55 p-3 sm:p-6 flex items-center justify-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-payments-title"
        className="w-full max-w-2xl max-h-[92vh] overflow-hidden rounded-3xl bg-white shadow-2xl flex flex-col"
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <h2 id="manual-payments-title" className="font-black text-slate-900">Pembayaran Manual</h2>
              <p className="text-xs text-slate-500">Transfer masuk diverifikasi admin sebelum layanan aktif.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              aria-label="Muat ulang"
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup pembayaran"
              className="p-2 rounded-xl text-slate-500 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div className="overflow-y-auto p-4 sm:p-5 space-y-4">
          {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          {instructions ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
              <p className="text-[11px] font-black uppercase tracking-wide text-emerald-800">Tujuan transfer resmi</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">{instructions.bankName}</p>
                  <p className="text-xs text-slate-600">a.n. {instructions.accountName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void copyAccount()}
                  className="shrink-0 flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-800"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copied ? "Tersalin" : "Salin rekening"}
                </button>
              </div>
              <p className="mt-2 font-mono text-lg font-black tracking-wide text-slate-900">{instructions.accountNumber}</p>
              {instructions.instructions && (
                <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{instructions.instructions}</p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Admin belum mengatur rekening dan instruksi transfer.
            </div>
          )}

          {loading ? (
            <div className="py-12 flex justify-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : payments.length === 0 ? (
            <div className="py-12 text-center">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-300" />
              <p className="mt-2 text-sm font-bold text-slate-700">Belum ada tagihan</p>
              <p className="mt-1 text-xs text-slate-500">Tagihan lowongan, layanan, dan proyek akan muncul di sini.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {payments.map((payment) => {
                const canSubmit = payment.status === "awaiting_payment" || payment.status === "rejected";
                return (
                  <article key={payment.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          {TYPE_LABELS[payment.targetType] ?? "Pembayaran Rekhastha"}
                        </p>
                        <p className="mt-1 text-lg font-black text-slate-900">{formatRp(payment.amount)}</p>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                        payment.status === "confirmed"
                          ? "bg-emerald-100 text-emerald-800"
                          : payment.status === "rejected"
                            ? "bg-red-100 text-red-700"
                            : payment.status === "under_review"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-amber-100 text-amber-800"
                      }`}>
                        {payment.status === "confirmed" ? <CheckCircle2 className="w-3 h-3" /> : <Clock3 className="w-3 h-3" />}
                        {STATUS_LABELS[payment.status] ?? payment.status}
                      </span>
                    </div>
                    {payment.adminNote && (
                      <p className="mt-3 rounded-xl bg-red-50 p-2.5 text-xs text-red-700">{payment.adminNote}</p>
                    )}
                    {payment.status === "under_review" && payment.transferReference && (
                      <p className="mt-3 text-xs text-slate-600">Referensi transfer: <b>{payment.transferReference}</b></p>
                    )}
                    {canSubmit && (
                      <div className="mt-4 space-y-2">
                        <label className="block text-xs font-bold text-slate-700" htmlFor={`transfer-ref-${payment.id}`}>
                          Nomor referensi transfer
                        </label>
                        <input
                          id={`transfer-ref-${payment.id}`}
                          value={references[payment.id] ?? ""}
                          onChange={(event) => setReferences((old) => ({ ...old, [payment.id]: event.target.value }))}
                          placeholder="Contoh: nomor referensi dari aplikasi bank"
                          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                        />
                        <textarea
                          value={notes[payment.id] ?? ""}
                          onChange={(event) => setNotes((old) => ({ ...old, [payment.id]: event.target.value }))}
                          placeholder="Catatan transfer (opsional)"
                          rows={2}
                          className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                        />
                        <button
                          type="button"
                          disabled={!instructions || (references[payment.id]?.trim().length ?? 0) < 3 || busyId === payment.id}
                          onClick={() => void submitReference(payment.id)}
                          className="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {busyId === payment.id ? "Mengirim…" : "Saya sudah transfer"}
                        </button>
                      </div>
                    )}
                    <p className="mt-3 text-[10px] text-slate-400">
                      Dibuat {new Date(payment.createdAt).toLocaleString("id-ID")}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}