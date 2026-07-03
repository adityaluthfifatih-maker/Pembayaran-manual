import { useState, useEffect } from "react";
import { Link2, QrCode, CheckCircle2, Clock3, XCircle, Loader2, ScanLine } from "lucide-react";
import {
  submitRemoteProof,
  onsiteCheckout,
  fetchAttendanceStatus,
  type DailyPayout,
} from "@/lib/borongan-client";
import type { CustomJob } from "@/types/custom-job";

interface BoronganWorkerPanelProps {
  activeJob: CustomJob;
  onJobUpdate: (job: CustomJob) => void;
}

const EMERALD = "#065F46";
const GOLD = "#D4AF37";

const fmtRp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

/**
 * Worker-side borongan (project contract) panel shown on the active-job view.
 *
 *  • Remote → submit a proof-of-work URL, then track the employer's review.
 *  • On-site → a daily QR check-out that releases one day's wage fraction.
 */
export default function BoronganWorkerPanel({ activeJob, onJobUpdate }: BoronganWorkerPanelProps) {
  if (activeJob.boronganType === "remote") {
    return <RemoteMilestone activeJob={activeJob} onJobUpdate={onJobUpdate} />;
  }
  if (activeJob.boronganType === "onsite") {
    return <OnsiteDailyQr activeJob={activeJob} onJobUpdate={onJobUpdate} />;
  }
  return null;
}

// ── Remote milestone proof-of-work ────────────────────────────────────
function RemoteMilestone({ activeJob, onJobUpdate }: BoronganWorkerPanelProps) {
  const [url, setUrl] = useState(activeJob.proofUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = activeJob.proofStatus;

  const submit = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Masukkan link bukti kerja terlebih dahulu.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await submitRemoteProof(activeJob.id, trimmed);
      onJobUpdate(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim bukti kerja.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-2xl p-4 space-y-3"
      style={{ background: "rgba(6,95,70,0.06)", border: `1px solid ${EMERALD}33` }}
    >
      <div className="flex items-center gap-2">
        <Link2 className="w-4 h-4" style={{ color: EMERALD }} />
        <p className="text-xs font-black" style={{ color: EMERALD }}>
          Borongan Remote — Bukti Milestone
        </p>
      </div>

      {status === "approved" ? (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-xs font-bold text-emerald-700">Disetujui — dana cair</p>
        </div>
      ) : status === "rejected" ? (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2.5">
          <XCircle className="w-4 h-4 text-red-600 shrink-0" />
          <p className="text-xs font-bold text-red-700">
            Ditolak — diteruskan ke Pusat Resolusi Admin
          </p>
        </div>
      ) : status === "submitted" ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
            <Clock3 className="w-4 h-4 text-amber-600 shrink-0" />
            <p className="text-xs font-bold text-amber-700">Menunggu persetujuan employer</p>
          </div>
          {activeJob.proofUrl && (
            <a
              href={activeJob.proofUrl}
              target="_blank"
              rel="noreferrer"
              className="block text-[11px] font-medium text-emerald-700 underline truncate"
            >
              {activeJob.proofUrl}
            </a>
          )}
        </div>
      ) : (
        <>
          <p className="text-[11px] text-gray-500 leading-snug">
            Kirim link hasil kerja (Google Drive / Figma / GitHub) untuk ditinjau employer.
          </p>
          <input
            data-testid="input-proof-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://drive.google.com/..."
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
          />
          {error && <p className="text-[11px] font-semibold text-red-600">{error}</p>}
          <button
            data-testid="button-submit-proof"
            onClick={submit}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 rounded-xl font-black text-white text-sm py-3 active:scale-[0.98] transition-transform disabled:opacity-70"
            style={{ background: `linear-gradient(135deg,${EMERALD},#059669)` }}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            {busy ? "Mengirim..." : "Kirim Bukti Kerja"}
          </button>
        </>
      )}
    </div>
  );
}

// ── On-site daily QR fractional payout ────────────────────────────────
function OnsiteDailyQr({ activeJob, onJobUpdate }: BoronganWorkerPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPayout, setLastPayout] = useState<DailyPayout | null>(null);
  const [scannedIn, setScannedIn] = useState<boolean | null>(null);

  const totalDays = activeJob.jumlahHari ?? 1;
  const daysPaid = activeJob.daysPaid ?? 0;
  const done = daysPaid >= totalDays;
  const progressPct = Math.min(100, Math.round((daysPaid / Math.max(1, totalDays)) * 100));

  useEffect(() => {
    let cancelled = false;
    fetchAttendanceStatus(activeJob.id)
      .then(({ scannedIn: s }) => { if (!cancelled) setScannedIn(s); })
      .catch(() => { if (!cancelled) setScannedIn(false); });
    return () => { cancelled = true; };
  }, [activeJob.id]);

  const checkout = async () => {
    setBusy(true);
    setError(null);
    try {
      const { gig, payout } = await onsiteCheckout(activeJob.id);
      setLastPayout(payout);
      onJobUpdate(gig);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal check-out harian.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="rounded-2xl p-4 space-y-3"
      style={{ background: "rgba(6,95,70,0.06)", border: `1px solid ${EMERALD}33` }}
    >
      <div className="flex items-center gap-2">
        <QrCode className="w-4 h-4" style={{ color: EMERALD }} />
        <p className="text-xs font-black" style={{ color: EMERALD }}>
          Borongan On-Site — Upah Harian
        </p>
      </div>

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-bold">
          <span className="text-gray-600">
            Hari ke-{Math.min(daysPaid, totalDays)} dari {totalDays}
          </span>
          <span style={{ color: GOLD }}>{progressPct}%</span>
        </div>
        <div className="w-full h-2 rounded-full bg-gray-200 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${progressPct}%`, background: `linear-gradient(90deg,${EMERALD},${GOLD})` }}
          />
        </div>
      </div>

      {lastPayout && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5">
          <p className="text-xs font-black text-emerald-700">
            Upah harian cair: {fmtRp(lastPayout.netToWorker)} (Hari ke-{lastPayout.dayIndex} dari {totalDays})
          </p>
          <p className="text-[10px] text-emerald-600/80 mt-0.5">
            Bruto {fmtRp(lastPayout.grossFraction)} − biaya {fmtRp(lastPayout.platformFee)}
          </p>
        </div>
      )}

      {error && <p className="text-[11px] font-semibold text-red-600">{error}</p>}

      {done ? (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <p className="text-xs font-bold text-emerald-700">
            Seluruh {totalDays} hari upah telah dicairkan.
          </p>
        </div>
      ) : scannedIn === null ? (
        <div className="flex items-center justify-center gap-2 py-3">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
          <span className="text-xs text-gray-500">Memeriksa presensi...</span>
        </div>
      ) : !scannedIn ? (
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-3">
          <ScanLine className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-black text-amber-800">Scan QR masuk terlebih dahulu</p>
            <p className="text-[11px] text-amber-700 mt-0.5 leading-snug">
              Minta employer untuk menampilkan QR presensi masuk hari ini sebelum dapat check-out.
            </p>
          </div>
        </div>
      ) : (
        <button
          data-testid="button-onsite-checkout"
          onClick={checkout}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 rounded-xl font-black text-white text-sm py-3 active:scale-[0.98] transition-transform disabled:opacity-70"
          style={{ background: `linear-gradient(135deg,${EMERALD},#059669)` }}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
          {busy ? "Memproses..." : "Check-out QR Harian"}
        </button>
      )}
    </div>
  );
}
