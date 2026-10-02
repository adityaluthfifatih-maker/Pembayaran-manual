import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Banknote, CheckCircle2, Loader2, RefreshCw, Save, XCircle } from "lucide-react";
import {
  fetchManualFinanceSettings,
  fetchManualPayments,
  fetchManualPayouts,
  resolveManualPayout,
  reviewManualPayment,
  saveManualFinanceSettings,
  type ManualFinanceSettings,
  type ManualPaymentRow,
  type ManualPayoutRow,
} from "@/lib/admin-client";

const TARGET_LABELS: Record<string, string> = {
  gig_escrow: "Upah gig reguler",
  instant_listing: "Instan Kilat",
  legacy_subscription: "Paket bulanan",
  business_subscription: "Rekhastha Bisnis",
  project_escrow: "Pendanaan proyek",
};

const PAYMENT_STATUS: Record<string, string> = {
  awaiting_payment: "Menunggu transfer",
  under_review: "Perlu ditinjau",
  confirmed: "Dikonfirmasi",
  rejected: "Ditolak",
};

const fmt = (amount: number) => `Rp ${Math.round(amount).toLocaleString("id-ID")}`;

export default function ManualFinanceAdminTab() {
  const [settings, setSettings] = useState<ManualFinanceSettings | null>(null);
  const [form, setForm] = useState({ bankName: "", accountName: "", accountNumber: "", instructions: "" });
  const [payments, setPayments] = useState<ManualPaymentRow[]>([]);
  const [payouts, setPayouts] = useState<ManualPayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [busyKey, setBusyKey] = useState("");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [references, setReferences] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [settingsResult, paymentResult, payoutResult] = await Promise.all([
        fetchManualFinanceSettings(),
        fetchManualPayments(),
        fetchManualPayouts(),
      ]);
      setSettings(settingsResult.settings);
      if (settingsResult.settings) {
        const { bankName, accountName, accountNumber, instructions } = settingsResult.settings;
        setForm({ bankName, accountName, accountNumber, instructions });
      }
      setPayments(paymentResult.payments);
      setPayouts(payoutResult.payouts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Data keuangan manual gagal dimuat.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingSettings(true);
    setError("");
    setMessage("");
    try {
      const result = await saveManualFinanceSettings(form);
      setSettings(result.settings);
      setMessage("Rekening penerima dan instruksi transfer diperbarui.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pengaturan rekening gagal disimpan.");
    } finally {
      setSavingSettings(false);
    }
  };

  const reviewPayment = async (payment: ManualPaymentRow, action: "confirm" | "reject") => {
    const key = `payment-${payment.id}`;
    setBusyKey(key);
    setError("");
    setMessage("");
    try {
      await reviewManualPayment(payment.id, action, notes[payment.id] ?? "");
      setMessage(action === "confirm" ? "Pembayaran dikonfirmasi dan layanan diaktifkan." : "Pembayaran ditolak.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pembayaran gagal diproses.");
    } finally {
      setBusyKey("");
    }
  };

  const resolvePayout = async (payout: ManualPayoutRow, action: "paid" | "reject") => {
    const key = `payout-${payout.id}`;
    setBusyKey(key);
    setError("");
    setMessage("");
    try {
      await resolveManualPayout(payout.id, action, {
        transferReference: references[payout.id]?.trim(),
        note: notes[-payout.id] ?? "",
      });
      setMessage(action === "paid" ? "Transfer dicatat sebagai selesai." : "Permintaan pencairan ditolak.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pencairan gagal diproses.");
    } finally {
      setBusyKey("");
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start gap-3">
          <Banknote className="mt-0.5 h-5 w-5 text-emerald-800" />
          <div>
            <h3 className="font-black text-emerald-950">Transfer manual</h3>
            <p className="mt-1 text-sm leading-relaxed text-emerald-900">
              Konfirmasi pembayaran hanya setelah dana terlihat di rekening. Payout baru berstatus selesai setelah transfer bank dilakukan dan referensinya dicatat.
            </p>
          </div>
        </div>
      </section>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}

      <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-black text-gray-900">Rekening penerima pembayaran</h3>
            <p className="mt-1 text-xs text-gray-500">Ditampilkan kepada perusahaan sebelum mereka mengirim transfer.</p>
          </div>
          {settings && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-800">Aktif</span>}
        </div>
        <form onSubmit={(event) => void saveSettings(event)} className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-bold text-gray-700">
            Nama bank
            <input required minLength={2} maxLength={80} value={form.bankName}
              onChange={(e) => setForm((old) => ({ ...old, bankName: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-500" />
          </label>
          <label className="space-y-1 text-xs font-bold text-gray-700">
            Nama pemilik rekening
            <input required minLength={2} maxLength={120} value={form.accountName}
              onChange={(e) => setForm((old) => ({ ...old, accountName: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-500" />
          </label>
          <label className="space-y-1 text-xs font-bold text-gray-700 sm:col-span-2">
            Nomor rekening
            <input required minLength={5} maxLength={40} value={form.accountNumber}
              onChange={(e) => setForm((old) => ({ ...old, accountNumber: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-500" />
          </label>
          <label className="space-y-1 text-xs font-bold text-gray-700 sm:col-span-2">
            Petunjuk transfer
            <textarea maxLength={800} rows={3} value={form.instructions}
              onChange={(e) => setForm((old) => ({ ...old, instructions: e.target.value }))}
              className="mt-1 w-full resize-y rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-emerald-500" />
          </label>
          <div className="sm:col-span-2">
            <button disabled={savingSettings} className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Simpan rekening
            </button>
          </div>
        </form>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-black text-gray-900">Pembayaran masuk</h3>
              <p className="mt-1 text-xs text-gray-500">Konfirmasi transfer untuk mengaktifkan layanan.</p>
            </div>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">
              {payments.filter((payment) => payment.status === "under_review").length} perlu ditinjau
            </span>
          </div>
          {loading ? (
            <div className="flex justify-center py-10 text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : payments.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">Belum ada tagihan.</p>
          ) : (
            <div className="space-y-3">
              {payments.map((payment) => (
                <article key={payment.id} className="rounded-xl border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{TARGET_LABELS[payment.targetType] ?? payment.targetType}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{payment.payerName} · {payment.payerEmail ?? payment.payerId}</p>
                    </div>
                    <span className="shrink-0 text-sm font-black text-gray-900">{fmt(payment.amount)}</span>
                  </div>
                  <div className="mt-2 rounded-lg bg-gray-50 p-2.5 text-xs text-gray-700">
                    <p>Status: <b>{PAYMENT_STATUS[payment.status] ?? payment.status}</b></p>
                    <p className="mt-1">Ref: {payment.transferReference || "Belum dikirim"}</p>
                    {payment.proofNote && <p className="mt-1 whitespace-pre-wrap">Catatan: {payment.proofNote}</p>}
                    {payment.adminNote && <p className="mt-1 text-red-700">Catatan admin: {payment.adminNote}</p>}
                  </div>
                  {payment.status === "under_review" && (
                    <div className="mt-2 space-y-2">
                      <input value={notes[payment.id] ?? ""} maxLength={500}
                        onChange={(e) => setNotes((old) => ({ ...old, [payment.id]: e.target.value }))}
                        placeholder="Catatan admin (opsional)"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-emerald-500" />
                      <div className="flex gap-2">
                        <button onClick={() => void reviewPayment(payment, "confirm")} disabled={busyKey === `payment-${payment.id}`}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 py-2 text-xs font-bold text-white disabled:opacity-50">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Konfirmasi transfer
                        </button>
                        <button onClick={() => void reviewPayment(payment, "reject")} disabled={busyKey === `payment-${payment.id}`}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-50 py-2 text-xs font-bold text-red-700 disabled:opacity-50">
                          <XCircle className="h-3.5 w-3.5" /> Tolak bukti
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
          <div className="mb-4">
            <h3 className="font-black text-gray-900">Permintaan payout pekerja</h3>
            <p className="mt-1 text-xs text-gray-500">Transfer manual ke rekening yang tersimpan saat permintaan dibuat.</p>
          </div>
          {loading ? (
            <div className="flex justify-center py-10 text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : payouts.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">Belum ada permintaan pencairan.</p>
          ) : (
            <div className="space-y-3">
              {payouts.map((payout) => (
                <article key={payout.id} className="rounded-xl border border-gray-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{payout.workerName}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{payout.workerEmail ?? payout.workerId}</p>
                    </div>
                    <span className="text-sm font-black text-gray-900">{fmt(payout.amount)}</span>
                  </div>
                  <div className="mt-2 rounded-lg bg-gray-50 p-2.5 text-xs text-gray-700">
                    <p><b>{payout.bankName}</b> · a.n. {payout.accountName}</p>
                    <p className="mt-1 font-mono text-sm font-bold">{payout.accountNumber}</p>
                    <p className="mt-1">Status: <b>{payout.status}</b></p>
                    {payout.transferReference && <p className="mt-1">Ref transfer: {payout.transferReference}</p>}
                    {payout.adminNote && <p className="mt-1">Catatan: {payout.adminNote}</p>}
                  </div>
                  {payout.status === "pending" && (
                    <div className="mt-2 space-y-2">
                      <input value={references[payout.id] ?? ""} maxLength={120}
                        onChange={(e) => setReferences((old) => ({ ...old, [payout.id]: e.target.value }))}
                        placeholder="Referensi transfer wajib diisi"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-emerald-500" />
                      <input value={notes[-payout.id] ?? ""} maxLength={500}
                        onChange={(e) => setNotes((old) => ({ ...old, [-payout.id]: e.target.value }))}
                        placeholder="Catatan admin (opsional)"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-emerald-500" />
                      <div className="flex gap-2">
                        <button onClick={() => void resolvePayout(payout, "paid")} disabled={busyKey === `payout-${payout.id}` || (references[payout.id]?.trim().length ?? 0) < 3}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-700 py-2 text-xs font-bold text-white disabled:opacity-50">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Tandai sudah ditransfer
                        </button>
                        <button onClick={() => void resolvePayout(payout, "reject")} disabled={busyKey === `payout-${payout.id}`}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-50 py-2 text-xs font-bold text-red-700 disabled:opacity-50">
                          <AlertTriangle className="h-3.5 w-3.5" /> Tolak
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={() => void load()} disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 disabled:opacity-50">
          <RefreshCw className="h-3.5 w-3.5" /> Muat ulang data
        </button>
      </div>
    </div>
  );
}