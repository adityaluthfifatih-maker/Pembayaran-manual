import { X, Download, Printer } from "lucide-react";
import { CustomJob, calcTotal, paymentLabels, paymentUnits } from "@/types/custom-job";
import { calcEmployerFee, DEFAULT_FEE_RATE } from "@/types/escrow";
import { WorkerProfile } from "@/types/worker-profile";

interface PaySlipModalProps {
  job: CustomJob;
  workerProfile: WorkerProfile;
  clockedInAt: Date | null;
  clockedOutAt: Date | null;
  onClose: () => void;
}

function formatRp(v: number) {
  return "Rp " + v.toLocaleString("id-ID");
}

function formatDate(d: Date) {
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
}

export default function PaySlipModal({ job, workerProfile, clockedInAt, clockedOutAt, onClose }: PaySlipModalProps) {
  const gross = calcTotal(job.nominal, job.pembayaran);
  const commission = calcEmployerFee(gross, job.feeRate ?? DEFAULT_FEE_RATE);
  const net = gross;

  const durationHours = clockedInAt && clockedOutAt
    ? ((clockedOutAt.getTime() - clockedInAt.getTime()) / 3600000).toFixed(1)
    : "8.0";

  const slipDate = clockedOutAt ?? new Date();

  const handlePrint = () => {
    const el = document.getElementById("pay-slip-content");
    if (!el) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html><head><title>Slip Gaji - ${workerProfile.namaLengkap}</title>
      <style>
        body { font-family: 'Courier New', monospace; padding: 20px; max-width: 400px; margin: 0 auto; font-size: 12px; color: #111; }
        h1 { text-align: center; font-size: 16px; margin-bottom: 4px; }
        .sub { text-align: center; font-size: 11px; color: #555; margin-bottom: 16px; }
        hr { border: none; border-top: 1px dashed #999; margin: 10px 0; }
        .row { display: flex; justify-content: space-between; margin: 3px 0; }
        .row.bold { font-weight: bold; }
        .row.big { font-size: 14px; font-weight: bold; }
        .label { color: #555; }
        .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #888; }
      </style></head><body>${el.innerHTML}</body></html>
    `);
    w.document.close();
    w.print();
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col justify-end"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)" }}
    >
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="relative bg-white rounded-t-3xl w-full max-h-[90vh] overflow-y-auto"
        style={{ animation: "slideUp 0.28s cubic-bezier(0.32,0.72,0,1)" }}
      >
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-gray-200" /></div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-bold text-gray-900">Slip Gaji</h2>
            <p className="text-xs text-gray-500 mt-0.5">{formatDate(slipDate)}</p>
          </div>
          <div className="flex gap-2">
            <button
              data-testid="button-print-slip"
              onClick={handlePrint}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"
            >
              <Printer className="w-4 h-4 text-gray-600" />
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100">
              <X className="w-4 h-4 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Slip content */}
        <div className="px-5 py-4" id="pay-slip-content">
          <div className="font-mono text-[11px] border border-dashed border-gray-300 rounded-xl p-4 space-y-0 bg-gray-50">
            {/* Header */}
            <div className="text-center pb-3 border-b border-dashed border-gray-300">
              <p className="font-bold text-base text-gray-900">JAKARTA GIG FINDER</p>
              <p className="text-gray-500 text-[10px]">Platform Tenaga Kerja Harian</p>
              <p className="text-gray-500 text-[10px]">Jakarta, Indonesia</p>
              <p className="font-bold text-sm mt-2 text-gray-800">SLIP GAJI</p>
              <p className="text-[10px] text-gray-500">No: JGF/{slipDate.getFullYear()}/{String(job.id).padStart(4, "0")}</p>
            </div>

            {/* Worker identity */}
            <div className="py-3 border-b border-dashed border-gray-300 space-y-1">
              <Row label="Nama Pekerja" value={workerProfile.namaLengkap} />
              <Row label="NIK" value={workerProfile.nik} />
              <Row label="NPWP" value={workerProfile.belumPunyaNpwp ? "Tidak ada" : workerProfile.npwp || "—"} />
              <Row label="Bank / Rekening" value={`${workerProfile.namaBank} · ${workerProfile.nomorRekening}`} />
            </div>

            {/* Job info */}
            <div className="py-3 border-b border-dashed border-gray-300 space-y-1">
              <Row label="Posisi / Pekerjaan" value={job.posisi} />
              <Row label="Sistem Bayaran" value={paymentLabels[job.pembayaran]} />
              <Row
                label="Tarif"
                value={`${formatRp(job.nominal)} / ${paymentUnits[job.pembayaran]}`}
              />
              <Row label="Durasi Kerja" value={`${durationHours} Jam`} />
              {clockedInAt && <Row label="Clock-In" value={clockedInAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} />}
              {clockedOutAt && <Row label="Clock-Out" value={clockedOutAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} />}
            </div>

            {/* Earnings breakdown */}
            <div className="py-3 border-b border-dashed border-gray-300 space-y-1">
              <p className="font-bold text-[10px] text-gray-700 mb-1.5">RINCIAN PENGHASILAN</p>
              <Row label={`Total Kotor (${paymentLabels[job.pembayaran]})`} value={formatRp(gross)} />
            </div>

            {/* Deductions */}
            <div className="py-3 border-b border-dashed border-gray-300 space-y-1">
              <p className="font-bold text-[10px] text-gray-700 mb-1.5">POTONGAN</p>
              <Row label="Potongan Pekerja" value={`- ${formatRp(0)}`} />
              <Row label={`Biaya Platform ${Math.round((job.feeRate ?? DEFAULT_FEE_RATE) * 100)}% (Beban Perusahaan)`} value={`${formatRp(commission)}`} />
            </div>

            {/* Net */}
            <div className="pt-3 space-y-1">
              <div className="flex justify-between font-bold text-sm text-gray-900">
                <span>PENGHASILAN BERSIH</span>
                <span className="text-primary">{formatRp(net)}</span>
              </div>
              <Row label="Ditransfer ke" value={`${workerProfile.namaBank} · ${workerProfile.nomorRekening}`} />
              <Row label="Atas nama" value={workerProfile.namaRekening || workerProfile.namaLengkap} />
            </div>

            {/* Footer */}
            <div className="pt-4 text-center text-[9px] text-gray-400 border-t border-dashed border-gray-300 mt-3 space-y-0.5">
              <p className="leading-tight">Segala kewajiban perpajakan menjadi tanggung jawab</p>
              <p className="leading-tight">mandiri masing-masing pihak sesuai hukum yang berlaku.</p>
              <p className="mt-1">Dicetak: {new Date().toLocaleString("id-ID")}</p>
            </div>
          </div>
        </div>

        {/* Download button */}
        <div className="px-5 pb-8 pt-2">
          <button
            data-testid="button-download-slip"
            onClick={handlePrint}
            className="w-full bg-primary text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-[0.98] transition-all"
            style={{ boxShadow: "0 4px 16px rgba(6,95,70,0.3)" }}
          >
            <Download className="w-5 h-5" />
            Unduh / Cetak Slip Gaji
          </button>
        </div>
      </div>
      <style>{`@keyframes slideUp { from{transform:translateY(100%);opacity:0.6} to{transform:translateY(0);opacity:1} }`}</style>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="text-gray-900 font-medium text-right">{value}</span>
    </div>
  );
}
