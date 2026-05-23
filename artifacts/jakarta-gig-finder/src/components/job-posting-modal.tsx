import { useState, useEffect } from "react";
import { X, Plus } from "lucide-react";
import { CustomJob, PaymentType, calcCommission, calcTotal, paymentLabels } from "@/types/custom-job";

interface JobPostingModalProps {
  onSubmit: (job: Omit<CustomJob, "id" | "type" | "lat" | "lng" | "postedAt">) => void;
}

function formatRupiah(value: number): string {
  if (!value) return "Rp 0";
  return "Rp " + value.toLocaleString("id-ID");
}

export default function JobPostingModal({ onSubmit }: JobPostingModalProps) {
  const [open, setOpen] = useState(false);
  const [posisi, setPosisi] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [pembayaran, setPembayaran] = useState<PaymentType>("per_jam");
  const [nominal, setNominal] = useState("");
  const [dresscode, setDresscode] = useState("");
  const [kuota, setKuota] = useState("1");

  const nominalNum = parseInt(nominal.replace(/\D/g, "")) || 0;
  const commission = calcCommission(nominalNum, pembayaran);
  const total = calcTotal(nominalNum, pembayaran);

  const handleNominalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "");
    setNominal(raw ? parseInt(raw).toLocaleString("id-ID") : "");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!posisi.trim() || !deskripsi.trim() || !nominalNum || !dresscode.trim()) return;
    onSubmit({
      posisi: posisi.trim(),
      deskripsi: deskripsi.trim(),
      pembayaran,
      nominal: nominalNum,
      dresscode: dresscode.trim(),
      kuota: parseInt(kuota) || 1,
    });
    setPosisi("");
    setDeskripsi("");
    setPembayaran("per_jam");
    setNominal("");
    setDresscode("");
    setKuota("1");
    setOpen(false);
  };

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Floating Action Button */}
      <button
        data-testid="button-open-job-posting"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-4 z-50 flex items-center gap-2 bg-primary text-white font-semibold px-5 py-3.5 rounded-full shadow-xl hover:bg-primary/90 active:scale-95 transition-all"
        style={{ boxShadow: "0 4px 20px rgba(6,95,70,0.45)" }}
      >
        <Plus className="w-5 h-5" />
        <span className="text-sm">Buka Lowongan Baru</span>
      </button>

      {/* Modal Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[200] flex flex-col justify-end"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
        >
          {/* Tap outside to close */}
          <div className="absolute inset-0" onClick={() => setOpen(false)} />

          <div
            className="relative bg-white rounded-t-3xl w-full max-h-[92vh] overflow-y-auto"
            style={{ animation: "slideUp 0.28s cubic-bezier(0.32,0.72,0,1)" }}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Buat Lowongan Baru</h2>
                <p className="text-xs text-gray-500 mt-0.5">Lowongan akan tampil langsung di peta</p>
              </div>
              <button
                data-testid="button-close-modal"
                onClick={() => setOpen(false)}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                <X className="w-4 h-4 text-gray-600" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="px-5 py-5 space-y-5">
              {/* Nama Posisi */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-800">
                  Nama Posisi / Pekerjaan <span className="text-red-500">*</span>
                </label>
                <input
                  data-testid="input-posisi"
                  type="text"
                  value={posisi}
                  onChange={(e) => setPosisi(e.target.value)}
                  placeholder="cth: Asisten Fotografer, Penjaga Booth"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  required
                />
              </div>

              {/* Deskripsi */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-800">
                  Deskripsi & Tugas Spesifik <span className="text-red-500">*</span>
                </label>
                <textarea
                  data-testid="input-deskripsi"
                  value={deskripsi}
                  onChange={(e) => setDeskripsi(e.target.value)}
                  placeholder="Jelaskan tugas, instruksi kerja, dan ekspektasi Anda secara detail..."
                  rows={4}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none"
                  required
                />
              </div>

              {/* Sistem Bayaran */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-800">Sistem Bayaran</label>
                <div className="flex gap-2">
                  {(["per_jam", "per_shift", "per_projek"] as PaymentType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      data-testid={`button-payment-${type}`}
                      onClick={() => setPembayaran(type)}
                      className={`flex-1 py-2.5 px-2 rounded-xl text-xs font-semibold border transition-all ${
                        pembayaran === type
                          ? "bg-primary text-white border-primary"
                          : "bg-white text-gray-600 border-gray-200 hover:border-primary/40"
                      }`}
                    >
                      {paymentLabels[type]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nominal Bayaran */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-800">
                  Nominal Bayaran (Rupiah) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500">Rp</span>
                  <input
                    data-testid="input-nominal"
                    type="text"
                    inputMode="numeric"
                    value={nominal}
                    onChange={handleNominalChange}
                    placeholder="0"
                    className="w-full border border-gray-200 rounded-xl pl-10 pr-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                    required
                  />
                </div>

                {/* Real-time commission display */}
                {nominalNum > 0 && (
                  <div
                    className="mt-2 rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 space-y-2"
                    data-testid="commission-preview"
                  >
                    <div className="flex justify-between text-xs text-gray-600">
                      <span>
                        {pembayaran === "per_jam"
                          ? `Total kerja (${formatRupiah(nominalNum)} × 8 jam)`
                          : "Total pembayaran"}
                      </span>
                      <span className="font-medium text-gray-900">{formatRupiah(total)}</span>
                    </div>
                    <div className="flex justify-between text-xs border-t border-primary/10 pt-2">
                      <span className="text-gray-600">Biaya layanan platform (15%)</span>
                      <span className="font-bold text-primary">{formatRupiah(commission)}</span>
                    </div>
                    <div className="flex justify-between text-xs border-t border-primary/10 pt-2">
                      <span className="font-semibold text-gray-800">Anda membayar ke pekerja</span>
                      <span className="font-bold text-gray-900">{formatRupiah(total - commission)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Dresscode */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-800">
                  Persyaratan Pakaian & Atribut <span className="text-red-500">*</span>
                </label>
                <input
                  data-testid="input-dresscode"
                  type="text"
                  value={dresscode}
                  onChange={(e) => setDresscode(e.target.value)}
                  placeholder="cth: Baju bebas rapi, bawa laptop sendiri"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  required
                />
              </div>

              {/* Kuota */}
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-gray-800">Kuota Pekerja</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setKuota((k) => String(Math.max(1, parseInt(k) - 1)))}
                    className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-lg font-bold text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  >
                    −
                  </button>
                  <span className="text-xl font-bold text-gray-900 w-8 text-center">{kuota}</span>
                  <button
                    type="button"
                    onClick={() => setKuota((k) => String(parseInt(k) + 1))}
                    className="w-10 h-10 rounded-full border border-gray-200 flex items-center justify-center text-lg font-bold text-gray-600 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  >
                    +
                  </button>
                  <span className="text-sm text-gray-500 ml-1">orang dibutuhkan</span>
                </div>
              </div>

              {/* Submit */}
              <div className="pt-2 pb-6">
                <button
                  data-testid="button-submit-job"
                  type="submit"
                  className="w-full bg-primary text-white font-bold py-3.5 rounded-xl text-base hover:bg-primary/90 active:scale-[0.98] transition-all shadow-lg"
                  style={{ boxShadow: "0 4px 16px rgba(6,95,70,0.35)" }}
                >
                  Terbitkan Lowongan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0.6; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
